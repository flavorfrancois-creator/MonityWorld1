"""
Merchant Portal Routes - Portail Marchand
Includes: Merchant registration, dashboard, invoices, products, POS, Export PDF/CSV
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import random
import string
import qrcode
from io import BytesIO
import base64
import csv
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

router = APIRouter(prefix="/api/merchant", tags=["Merchant"])


# === MODELS ===
class MerchantRegisterReq(BaseModel):
    """Inscription marchand"""
    phone: str
    name: str
    email: Optional[str] = None
    password: str
    business_name: str
    business_type: str  # restaurant, shop, service, online, other
    business_address: Optional[str] = None
    country: str = "CD"
    language: str = "fr"
    tax_id: Optional[str] = None  # Numéro fiscal


class MerchantProfileReq(BaseModel):
    """Update merchant profile"""
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    business_address: Optional[str] = None
    business_logo: Optional[str] = None
    business_description: Optional[str] = None
    tax_id: Optional[str] = None


class ProductReq(BaseModel):
    """Product/Service creation"""
    name: str
    description: Optional[str] = None
    price: float
    currency: str = "USD"
    category: Optional[str] = None
    sku: Optional[str] = None
    stock: Optional[int] = None  # None = unlimited (service)
    is_active: bool = True


class ProductUpdateReq(BaseModel):
    """Product/Service update - all fields optional"""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    sku: Optional[str] = None
    stock: Optional[int] = None
    is_active: Optional[bool] = None


class InvoiceItemReq(BaseModel):
    """Invoice line item"""
    product_id: Optional[str] = None  # Link to product
    description: str
    quantity: float = 1
    unit_price: float
    tax_rate: float = 0  # % tax


class InvoiceReq(BaseModel):
    """Invoice creation"""
    client_phone: Optional[str] = None  # Client Monity phone
    client_name: str
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    items: List[InvoiceItemReq]
    currency: str = "USD"
    due_date: Optional[str] = None  # ISO date
    notes: Optional[str] = None
    discount_amount: float = 0
    discount_type: str = "fixed"  # fixed or percentage


class POSTransactionReq(BaseModel):
    """Point of Sale transaction"""
    items: List[InvoiceItemReq]
    currency: str = "USD"
    payment_method: str  # cash, monity, card
    client_phone: Optional[str] = None  # For Monity payment
    discount_amount: float = 0


# === HELPER FUNCTIONS ===
def gen_id(): return str(uuid.uuid4())
def now_iso(): return datetime.now(timezone.utc).isoformat()
def gen_invoice_number(): return "INV-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
def gen_merchant_code(): return "MRC-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def generate_qr_code(data: str) -> str:
    """Generate QR code and return as base64 string"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()


def setup_merchant_routes(db, get_current_user, hash_pw, verify_pw, create_token, gen_account, gen_ref, get_country_config=None):
    """Setup merchant routes with database access"""
    
    async def get_merchant(user=Depends(get_current_user)):
        """Verify user is a merchant"""
        if user.get("role") != "merchant":
            raise HTTPException(403, "Accès réservé aux marchands")
        return user
    
    # === MERCHANT AUTH ===
    @router.post("/register")
    async def register_merchant(req: MerchantRegisterReq):
        """Register as merchant"""
        if await db.users.find_one({"phone": req.phone}):
            raise HTTPException(400, "Ce numéro est déjà enregistré")
        
        # Check email if provided
        if req.email:
            if await db.users.find_one({"email": req.email.lower()}):
                raise HTTPException(400, "Cet email est déjà enregistré")
        
        uid = gen_id()
        merchant_code = gen_merchant_code()
        
        # Get default currency for country
        default_currency = "USD"
        secondary_currency = "EUR"
        if get_country_config:
            config = get_country_config(req.country)
            default_currency = config.get("default_currency", "USD")
            secondary_currency = config.get("secondary_currency", "EUR")
        
        # Create user with merchant role
        user_doc = {
            "id": uid,
            "phone": req.phone,
            "name": req.name,
            "email": req.email.lower() if req.email else None,
            "password": hash_pw(req.password),
            "role": "merchant",
            "country": req.country,
            "language": req.language,
            "is_active": True,
            "is_verified": False,
            "kyc_status": "pending",
            "account_number": gen_account(),
            "referral_code": gen_ref(req.name),
            "merchant_code": merchant_code,
            "profile_image": None,
            "free_card_used": False,
            "max_wallets": 2,
            "created_at": now_iso()
        }
        await db.users.insert_one(user_doc)
        
        # Create merchant profile
        merchant_doc = {
            "id": gen_id(),
            "user_id": uid,
            "merchant_code": merchant_code,
            "business_name": req.business_name,
            "business_type": req.business_type,
            "business_address": req.business_address,
            "business_logo": None,
            "business_description": None,
            "tax_id": req.tax_id,
            "is_verified": False,
            "total_sales": 0,
            "total_revenue": 0,
            "customer_count": 0,
            "rating": 0,
            "review_count": 0,
            "created_at": now_iso()
        }
        await db.merchants.insert_one(merchant_doc)
        
        # Create default wallet
        await db.wallets.insert_one({
            "id": gen_id(),
            "user_id": uid,
            "currency": default_currency,
            "balance": 0.0,
            "is_primary": True,
            "created_at": now_iso()
        })
        
        # Create secondary wallet
        await db.wallets.insert_one({
            "id": gen_id(),
            "user_id": uid,
            "currency": secondary_currency,
            "balance": 0.0,
            "is_primary": False,
            "created_at": now_iso()
        })
        
        return {
            "message": "Compte marchand créé avec succès",
            "merchant_code": merchant_code,
            "user_id": uid
        }
    
    @router.get("/profile")
    async def get_merchant_profile(user=Depends(get_merchant)):
        """Get merchant profile"""
        merchant = await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0})
        if not merchant:
            raise HTTPException(404, "Profil marchand non trouvé")
        return merchant
    
    @router.patch("/profile")
    async def update_merchant_profile(req: MerchantProfileReq, user=Depends(get_merchant)):
        """Update merchant profile"""
        update = {k: v for k, v in req.model_dump().items() if v is not None}
        if update:
            update["updated_at"] = now_iso()
            await db.merchants.update_one({"user_id": user["id"]}, {"$set": update})
        return {"message": "Profil mis à jour"}
    
    # === MERCHANT DASHBOARD ===
    @router.get("/dashboard")
    async def merchant_dashboard(user=Depends(get_merchant)):
        """Get merchant dashboard stats"""
        merchant = await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0})
        
        # Get wallet balance
        wallets = await db.wallets.find({"user_id": user["id"]}, {"_id": 0}).to_list(10)
        
        # Get today's stats
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_sales = await db.merchant_transactions.count_documents({
            "merchant_id": user["id"],
            "created_at": {"$gte": today_start.isoformat()},
            "status": "completed"
        })
        
        today_revenue = 0
        async for tx in db.merchant_transactions.find({
            "merchant_id": user["id"],
            "created_at": {"$gte": today_start.isoformat()},
            "status": "completed"
        }, {"total": 1}):
            today_revenue += tx.get("total", 0)
        
        # Get pending invoices
        pending_invoices = await db.invoices.count_documents({
            "merchant_id": user["id"],
            "status": "sent"
        })
        
        # Get recent transactions
        recent_txs = await db.merchant_transactions.find(
            {"merchant_id": user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).limit(10).to_list(10)
        
        # Get monthly stats (last 30 days)
        thirty_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        monthly_stats = await db.merchant_transactions.aggregate([
            {"$match": {
                "merchant_id": user["id"],
                "created_at": {"$gte": thirty_ago},
                "status": "completed"
            }},
            {"$group": {
                "_id": None,
                "total_sales": {"$sum": 1},
                "total_revenue": {"$sum": "$total"}
            }}
        ]).to_list(1)
        
        return {
            "merchant": merchant,
            "wallets": wallets,
            "today": {
                "sales": today_sales,
                "revenue": round(today_revenue, 2)
            },
            "monthly": {
                "sales": monthly_stats[0]["total_sales"] if monthly_stats else 0,
                "revenue": round(monthly_stats[0]["total_revenue"], 2) if monthly_stats else 0
            },
            "pending_invoices": pending_invoices,
            "recent_transactions": recent_txs
        }
    
    # === PRODUCTS ===
    @router.get("/products")
    async def get_products(user=Depends(get_merchant)):
        """Get merchant products"""
        products = await db.products.find(
            {"merchant_id": user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        return {"products": products}
    
    @router.post("/products")
    async def create_product(req: ProductReq, user=Depends(get_merchant)):
        """Create a product"""
        doc = {
            "id": gen_id(),
            "merchant_id": user["id"],
            **req.model_dump(),
            "sales_count": 0,
            "created_at": now_iso()
        }
        await db.products.insert_one(doc)
        doc.pop("_id", None)
        return doc
    
    @router.patch("/products/{product_id}")
    async def update_product(product_id: str, req: ProductUpdateReq, user=Depends(get_merchant)):
        """Update a product"""
        product = await db.products.find_one({"id": product_id, "merchant_id": user["id"]})
        if not product:
            raise HTTPException(404, "Produit non trouvé")
        
        update = {k: v for k, v in req.model_dump().items() if v is not None}
        update["updated_at"] = now_iso()
        await db.products.update_one({"id": product_id}, {"$set": update})
        return {"message": "Produit mis à jour"}
    
    @router.delete("/products/{product_id}")
    async def delete_product(product_id: str, user=Depends(get_merchant)):
        """Delete a product"""
        result = await db.products.delete_one({"id": product_id, "merchant_id": user["id"]})
        if result.deleted_count == 0:
            raise HTTPException(404, "Produit non trouvé")
        return {"message": "Produit supprimé"}
    
    # === INVOICES ===
    @router.get("/invoices")
    async def get_invoices(status: str = "", user=Depends(get_merchant)):
        """Get merchant invoices"""
        query = {"merchant_id": user["id"]}
        if status:
            query["status"] = status
        
        invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"invoices": invoices}
    
    @router.post("/invoices")
    async def create_invoice(req: InvoiceReq, user=Depends(get_merchant)):
        """Create an invoice"""
        merchant = await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0})
        
        # Calculate totals
        subtotal = 0
        tax_total = 0
        items_with_totals = []
        
        for item in req.items:
            item_total = item.quantity * item.unit_price
            item_tax = item_total * (item.tax_rate / 100)
            subtotal += item_total
            tax_total += item_tax
            items_with_totals.append({
                **item.model_dump(),
                "total": round(item_total, 2),
                "tax_amount": round(item_tax, 2)
            })
        
        # Apply discount
        discount = req.discount_amount
        if req.discount_type == "percentage":
            discount = subtotal * (req.discount_amount / 100)
        
        total = subtotal + tax_total - discount
        
        # Find client user if phone provided
        client_user_id = None
        if req.client_phone:
            client = await db.users.find_one({"phone": req.client_phone})
            if client:
                client_user_id = client["id"]
        
        invoice_number = gen_invoice_number()
        # Generate QR code for payment
        payment_url = f"monity://pay/invoice/{invoice_number}"
        qr_code = generate_qr_code(payment_url)
        
        doc = {
            "id": gen_id(),
            "invoice_number": invoice_number,
            "merchant_id": user["id"],
            "merchant_name": merchant.get("business_name") if merchant else user["name"],
            "client_user_id": client_user_id,
            "client_phone": req.client_phone,
            "client_name": req.client_name,
            "client_email": req.client_email,
            "client_address": req.client_address,
            "items": items_with_totals,
            "currency": req.currency,
            "subtotal": round(subtotal, 2),
            "tax_total": round(tax_total, 2),
            "discount_amount": round(discount, 2),
            "discount_type": req.discount_type,
            "total": round(total, 2),
            "amount_paid": 0,
            "due_date": req.due_date,
            "notes": req.notes,
            "status": "draft",  # draft, sent, viewed, partial, paid, cancelled, overdue
            "payment_link": f"/invoice/{invoice_number}",
            "qr_code": qr_code,  # Base64 encoded QR code image
            "created_at": now_iso(),
            "sent_at": None,
            "paid_at": None
        }
        await db.invoices.insert_one(doc)
        doc.pop("_id", None)
        
        return doc
    
    @router.get("/invoices/{invoice_id}/qr")
    async def get_invoice_qr(invoice_id: str, user=Depends(get_merchant)):
        """Get invoice QR code as image"""
        invoice = await db.invoices.find_one({"id": invoice_id, "merchant_id": user["id"]})
        if not invoice:
            raise HTTPException(404, "Facture non trouvée")
        
        # Generate QR code
        payment_url = f"monity://pay/invoice/{invoice['invoice_number']}"
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(payment_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        buffered.seek(0)
        
        return StreamingResponse(buffered, media_type="image/png")
    
    @router.get("/invoices/{invoice_id}")
    async def get_invoice(invoice_id: str, user=Depends(get_merchant)):
        """Get invoice details"""
        invoice = await db.invoices.find_one(
            {"id": invoice_id, "merchant_id": user["id"]},
            {"_id": 0}
        )
        if not invoice:
            raise HTTPException(404, "Facture non trouvée")
        return invoice
    
    @router.patch("/invoices/{invoice_id}/send")
    async def send_invoice(invoice_id: str, user=Depends(get_merchant)):
        """Send invoice to client"""
        invoice = await db.invoices.find_one({"id": invoice_id, "merchant_id": user["id"]})
        if not invoice:
            raise HTTPException(404, "Facture non trouvée")
        
        if invoice["status"] not in ["draft", "cancelled"]:
            raise HTTPException(400, "Cette facture a déjà été envoyée")
        
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {"status": "sent", "sent_at": now_iso()}}
        )
        
        # Send notification to client if they have Monity account
        if invoice.get("client_user_id"):
            await db.notifications.insert_one({
                "id": gen_id(),
                "user_id": invoice["client_user_id"],
                "type": "invoice",
                "title": "Nouvelle facture",
                "message": f"Vous avez reçu une facture de {invoice['merchant_name']} pour {invoice['total']} {invoice['currency']}",
                "data": {
                    "invoice_id": invoice_id,
                    "invoice_number": invoice["invoice_number"],
                    "amount": invoice["total"],
                    "currency": invoice["currency"]
                },
                "is_read": False,
                "created_at": now_iso()
            })
        
        return {"message": "Facture envoyée", "status": "sent"}
    
    @router.patch("/invoices/{invoice_id}/cancel")
    async def cancel_invoice(invoice_id: str, user=Depends(get_merchant)):
        """Cancel an invoice"""
        invoice = await db.invoices.find_one({"id": invoice_id, "merchant_id": user["id"]})
        if not invoice:
            raise HTTPException(404, "Facture non trouvée")
        
        if invoice["status"] == "paid":
            raise HTTPException(400, "Impossible d'annuler une facture payée")
        
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {"status": "cancelled", "cancelled_at": now_iso()}}
        )
        
        return {"message": "Facture annulée"}
    
    @router.delete("/invoices/{invoice_id}")
    async def delete_invoice(invoice_id: str, user=Depends(get_merchant)):
        """Delete a draft invoice"""
        invoice = await db.invoices.find_one({"id": invoice_id, "merchant_id": user["id"]})
        if not invoice:
            raise HTTPException(404, "Facture non trouvée")
        
        if invoice["status"] != "draft":
            raise HTTPException(400, "Seules les factures brouillon peuvent être supprimées")
        
        await db.invoices.delete_one({"id": invoice_id})
        return {"message": "Facture supprimée"}
    
    # === POINT OF SALE (POS) ===
    @router.post("/pos/transaction")
    async def pos_transaction(req: POSTransactionReq, user=Depends(get_merchant)):
        """Create a POS transaction"""
        merchant = await db.merchants.find_one({"user_id": user["id"]})
        
        # Calculate totals
        subtotal = 0
        items_data = []
        for item in req.items:
            item_total = item.quantity * item.unit_price
            subtotal += item_total
            items_data.append({
                **item.model_dump(),
                "total": round(item_total, 2)
            })
        
        # Apply discount
        total = subtotal - req.discount_amount
        
        tx_id = gen_id()
        status = "completed" if req.payment_method == "cash" else "pending"
        
        # For Monity payment, deduct from client's wallet
        if req.payment_method == "monity" and req.client_phone:
            client = await db.users.find_one({"phone": req.client_phone})
            if not client:
                raise HTTPException(404, "Client Monity non trouvé")
            
            client_wallet = await db.wallets.find_one({
                "user_id": client["id"],
                "currency": req.currency
            })
            if not client_wallet or client_wallet["balance"] < total:
                raise HTTPException(400, "Solde client insuffisant")
            
            # Deduct from client
            await db.wallets.update_one(
                {"user_id": client["id"], "currency": req.currency},
                {"$inc": {"balance": -total}}
            )
            
            # Add to merchant
            merchant_wallet = await db.wallets.find_one({
                "user_id": user["id"],
                "currency": req.currency
            })
            if merchant_wallet:
                await db.wallets.update_one(
                    {"user_id": user["id"], "currency": req.currency},
                    {"$inc": {"balance": total}}
                )
            else:
                await db.wallets.insert_one({
                    "id": gen_id(),
                    "user_id": user["id"],
                    "currency": req.currency,
                    "balance": total,
                    "is_primary": False,
                    "created_at": now_iso()
                })
            
            status = "completed"
        
        doc = {
            "id": tx_id,
            "merchant_id": user["id"],
            "merchant_name": merchant.get("business_name") if merchant else user["name"],
            "client_phone": req.client_phone,
            "items": items_data,
            "subtotal": round(subtotal, 2),
            "discount_amount": round(req.discount_amount, 2),
            "total": round(total, 2),
            "currency": req.currency,
            "payment_method": req.payment_method,
            "status": status,
            "type": "pos",
            "created_at": now_iso()
        }
        await db.merchant_transactions.insert_one(doc)
        
        # Update merchant stats
        if status == "completed":
            await db.merchants.update_one(
                {"user_id": user["id"]},
                {
                    "$inc": {"total_sales": 1, "total_revenue": total}
                }
            )
        
        doc.pop("_id", None)
        return {"message": "Transaction enregistrée", "transaction": doc}
    
    @router.get("/transactions")
    async def get_merchant_transactions(
        page: int = 1,
        limit: int = 20,
        status: str = "",
        tx_type: str = "",
        user=Depends(get_merchant)
    ):
        """Get merchant transactions"""
        query = {"merchant_id": user["id"]}
        if status:
            query["status"] = status
        if tx_type:
            query["type"] = tx_type
        
        skip = (page - 1) * limit
        total = await db.merchant_transactions.count_documents(query)
        transactions = await db.merchant_transactions.find(
            query, {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        return {
            "transactions": transactions,
            "total": total,
            "page": page,
            "pages": -(-total // limit)
        }
    
    # === PUBLIC INVOICE PAYMENT ===
    @router.get("/invoice/public/{invoice_number}")
    async def get_public_invoice(invoice_number: str):
        """Get invoice for public payment page"""
        invoice = await db.invoices.find_one(
            {"invoice_number": invoice_number, "status": {"$in": ["sent", "viewed", "partial"]}},
            {"_id": 0}
        )
        if not invoice:
            raise HTTPException(404, "Facture non trouvée ou déjà payée")
        
        # Mark as viewed
        if invoice["status"] == "sent":
            await db.invoices.update_one(
                {"invoice_number": invoice_number},
                {"$set": {"status": "viewed", "viewed_at": now_iso()}}
            )
        
        return invoice
    
    @router.post("/invoice/public/{invoice_number}/pay")
    async def pay_invoice(invoice_number: str, payer_phone: str, amount: Optional[float] = None):
        """Pay an invoice via Monity"""
        invoice = await db.invoices.find_one({
            "invoice_number": invoice_number,
            "status": {"$in": ["sent", "viewed", "partial"]}
        })
        if not invoice:
            raise HTTPException(404, "Facture non trouvée ou déjà payée")
        
        # Find payer
        payer = await db.users.find_one({"phone": payer_phone})
        if not payer:
            raise HTTPException(404, "Utilisateur Monity non trouvé")
        
        # Determine payment amount
        remaining = invoice["total"] - invoice.get("amount_paid", 0)
        payment_amount = amount if amount and amount <= remaining else remaining
        
        # Check payer's balance
        payer_wallet = await db.wallets.find_one({
            "user_id": payer["id"],
            "currency": invoice["currency"]
        })
        if not payer_wallet or payer_wallet["balance"] < payment_amount:
            raise HTTPException(400, "Solde insuffisant")
        
        # Process payment
        await db.wallets.update_one(
            {"user_id": payer["id"], "currency": invoice["currency"]},
            {"$inc": {"balance": -payment_amount}}
        )
        
        # Add to merchant
        merchant_wallet = await db.wallets.find_one({
            "user_id": invoice["merchant_id"],
            "currency": invoice["currency"]
        })
        if merchant_wallet:
            await db.wallets.update_one(
                {"user_id": invoice["merchant_id"], "currency": invoice["currency"]},
                {"$inc": {"balance": payment_amount}}
            )
        else:
            await db.wallets.insert_one({
                "id": gen_id(),
                "user_id": invoice["merchant_id"],
                "currency": invoice["currency"],
                "balance": payment_amount,
                "is_primary": False,
                "created_at": now_iso()
            })
        
        # Update invoice
        new_amount_paid = invoice.get("amount_paid", 0) + payment_amount
        new_status = "paid" if new_amount_paid >= invoice["total"] else "partial"
        
        await db.invoices.update_one(
            {"invoice_number": invoice_number},
            {
                "$set": {
                    "amount_paid": new_amount_paid,
                    "status": new_status,
                    "paid_at": now_iso() if new_status == "paid" else None
                }
            }
        )
        
        # Record payment
        await db.merchant_transactions.insert_one({
            "id": gen_id(),
            "merchant_id": invoice["merchant_id"],
            "invoice_id": invoice["id"],
            "invoice_number": invoice_number,
            "payer_id": payer["id"],
            "payer_phone": payer_phone,
            "amount": payment_amount,
            "currency": invoice["currency"],
            "type": "invoice_payment",
            "status": "completed",
            "created_at": now_iso()
        })
        
        # Update merchant stats
        await db.merchants.update_one(
            {"user_id": invoice["merchant_id"]},
            {"$inc": {"total_sales": 1, "total_revenue": payment_amount}}
        )
        
        return {
            "message": "Paiement effectué",
            "amount_paid": payment_amount,
            "remaining": remaining - payment_amount,
            "invoice_status": new_status
        }
    
    # === MERCHANT CLIENTS ===
    @router.get("/clients")
    async def get_merchant_clients(user=Depends(get_merchant)):
        """Get list of clients who purchased from merchant"""
        # Get unique client phones from transactions
        pipeline = [
            {"$match": {"merchant_id": user["id"], "client_phone": {"$ne": None}}},
            {"$group": {
                "_id": "$client_phone",
                "total_purchases": {"$sum": 1},
                "total_spent": {"$sum": "$total"},
                "last_purchase": {"$max": "$created_at"}
            }},
            {"$sort": {"total_spent": -1}}
        ]
        
        clients_raw = await db.merchant_transactions.aggregate(pipeline).to_list(500)
        
        # Enrich with user data
        clients = []
        for c in clients_raw:
            user_data = await db.users.find_one({"phone": c["_id"]}, {"_id": 0, "password": 0})
            clients.append({
                "phone": c["_id"],
                "name": user_data.get("name") if user_data else "Client",
                "total_purchases": c["total_purchases"],
                "total_spent": round(c["total_spent"], 2),
                "last_purchase": c["last_purchase"],
                "has_monity_account": user_data is not None
            })
        
        return {"clients": clients, "total": len(clients)}
    
    # === EXPORT PDF/CSV ===
    
    @router.get("/invoices/export/csv")
    async def export_invoices_csv(user=Depends(get_merchant)):
        """Export all invoices as CSV"""
        invoices = await db.invoices.find({"merchant_id": user["id"]}, {"_id": 0}).to_list(1000)
        
        from io import StringIO
        output = StringIO()
        
        writer = csv.writer(output)
        writer.writerow(['N° Facture', 'Client', 'Téléphone', 'Email', 'Montant', 'Devise', 'Statut', 'Date Création', 'Date Échéance'])
        
        for inv in invoices:
            writer.writerow([
                inv.get('invoice_number', ''),
                inv.get('client_name', ''),
                inv.get('client_phone', ''),
                inv.get('client_email', ''),
                inv.get('total', 0),
                inv.get('currency', 'USD'),
                inv.get('status', ''),
                inv.get('created_at', '')[:10] if inv.get('created_at') else '',
                inv.get('due_date', '')[:10] if inv.get('due_date') else ''
            ])
        
        content = '\ufeff' + output.getvalue()  # BOM for Excel
        return Response(
            content=content.encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=factures.csv"}
        )
    
    @router.get("/transactions/export/csv")
    async def export_transactions_csv(user=Depends(get_merchant)):
        """Export all transactions as CSV"""
        transactions = await db.merchant_transactions.find({"merchant_id": user["id"]}, {"_id": 0}).to_list(1000)
        
        from io import StringIO
        output = StringIO()
        
        writer = csv.writer(output)
        writer.writerow(['ID', 'Type', 'Client', 'Montant', 'Devise', 'Méthode Paiement', 'Statut', 'Date'])
        
        for tx in transactions:
            writer.writerow([
                tx.get('id', '')[:8] if tx.get('id') else '',
                tx.get('type', ''),
                tx.get('client_phone', ''),
                tx.get('total', 0),
                tx.get('currency', 'USD'),
                tx.get('payment_method', ''),
                tx.get('status', ''),
                tx.get('created_at', '')[:10] if tx.get('created_at') else ''
            ])
        
        content = '\ufeff' + output.getvalue()
        return Response(
            content=content.encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=transactions.csv"}
        )
    
    @router.get("/invoices/{invoice_id}/export/pdf")
    async def export_invoice_pdf(invoice_id: str, user=Depends(get_merchant)):
        """Export a single invoice as PDF"""
        invoice = await db.invoices.find_one({"id": invoice_id, "merchant_id": user["id"]}, {"_id": 0})
        if not invoice:
            raise HTTPException(404, "Facture non trouvée")
        
        merchant = await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0})
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=20*mm, leftMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=24, spaceAfter=10, textColor=colors.HexColor('#10b981'))
        header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, spaceAfter=5)
        
        elements = []
        
        # Header
        elements.append(Paragraph(f"FACTURE {invoice.get('invoice_number', '')}", title_style))
        elements.append(Spacer(1, 10*mm))
        
        # Merchant Info
        business_name = merchant.get('business_name', 'Marchand') if merchant else 'Marchand'
        elements.append(Paragraph(f"<b>De:</b> {business_name}", header_style))
        elements.append(Spacer(1, 5*mm))
        
        # Client Info
        elements.append(Paragraph(f"<b>À:</b> {invoice.get('client_name', '')}", header_style))
        if invoice.get('client_phone'):
            elements.append(Paragraph(f"Tél: {invoice.get('client_phone')}", header_style))
        if invoice.get('client_email'):
            elements.append(Paragraph(f"Email: {invoice.get('client_email')}", header_style))
        elements.append(Spacer(1, 10*mm))
        
        # Items Table
        table_data = [['Description', 'Qté', 'Prix Unit.', 'Total']]
        for item in invoice.get('items', []):
            table_data.append([
                item.get('description', ''),
                str(item.get('quantity', 1)),
                f"{item.get('unit_price', 0)} {invoice.get('currency', 'USD')}",
                f"{item.get('total', 0)} {invoice.get('currency', 'USD')}"
            ])
        
        table = Table(table_data, colWidths=[80*mm, 20*mm, 35*mm, 35*mm])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')])
        ]))
        elements.append(table)
        elements.append(Spacer(1, 10*mm))
        
        # Totals
        currency = invoice.get('currency', 'USD')
        totals_data = [
            ['Sous-total:', f"{invoice.get('subtotal', 0)} {currency}"],
            ['TVA:', f"{invoice.get('tax_total', 0)} {currency}"],
        ]
        if invoice.get('discount_amount', 0) > 0:
            totals_data.append(['Remise:', f"-{invoice.get('discount_amount', 0)} {currency}"])
        totals_data.append(['TOTAL:', f"{invoice.get('total', 0)} {currency}"])
        
        totals_table = Table(totals_data, colWidths=[130*mm, 40*mm])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 12),
            ('TEXTCOLOR', (1, -1), (1, -1), colors.HexColor('#10b981')),
        ]))
        elements.append(totals_table)
        
        # QR Code if available
        if invoice.get('qr_code'):
            elements.append(Spacer(1, 10*mm))
            qr_data = base64.b64decode(invoice['qr_code'])
            qr_image = Image(BytesIO(qr_data), width=40*mm, height=40*mm)
            elements.append(qr_image)
        
        # Notes
        if invoice.get('notes'):
            elements.append(Spacer(1, 10*mm))
            elements.append(Paragraph(f"<b>Notes:</b> {invoice.get('notes')}", header_style))
        
        # Footer
        elements.append(Spacer(1, 15*mm))
        created_date = invoice.get('created_at', '')[:10] if invoice.get('created_at') else ''
        elements.append(Paragraph(f"Date: {created_date}", header_style))
        
        doc.build(elements)
        buffer.seek(0)
        
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=facture-{invoice.get('invoice_number', 'unknown')}.pdf"}
        )
    
    return router
