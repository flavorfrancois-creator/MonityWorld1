"""
Monity World - Admin WhatsApp Routes
Extracted from server.py during refactoring
"""
import os
import logging
import random
import string
import secrets
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, List
from fastapi import APIRouter, Body, HTTPException, Depends, Query, UploadFile, File, Request
from fastapi.responses import JSONResponse
from database import (
    db, get_current_user, get_admin, get_admin_with_kyc,
    gen_id, now_iso, hash_pw, verify_pw, create_token, gen_otp,
    gen_account, gen_ref, gen_barcode, gen_nfc_code, gen_printed_card_number,
    gen_reset_token, NON_CLIENT_ROLES
)
from utils.fees import get_exchange_rate, calculate_fee, get_transaction_rule, get_international_rule, check_transaction_limits
from utils.admin_helpers import get_admin_country_filter, build_country_query, build_transaction_country_query, check_admin_card_access
from utils.auth import is_admin_role, can_access_admin_routes, requires_admin_kyc
from rbac import (
    check_permission, get_role_info, get_role_level,
    is_primary_admin, is_original_primary_admin,
    can_manage_role, can_create_role, can_suspend_role,
    has_permission, require_permission
)
import httpx
from models.schemas import WhatsAppCloudApiTestReq, WhatsAppConfigReq, WhatsAppConfigureReq, WhatsAppOTPTemplateReq, WhatsAppPairingCodeReq, WhatsAppSendReq, WhatsAppValidateConfirmReq, WhatsAppValidateReq

logger = logging.getLogger(__name__)
from utils.activity import log_admin_activity, ACTIVITY_ACTIONS, ACTIVITY_RESOURCES

router = APIRouter(prefix="/api", tags=['Admin WhatsApp'])

# === WHATSAPP WEB INTEGRATION ===

WHATSAPP_SERVICE_URL = os.environ.get("WHATSAPP_SERVICE_URL", "http://localhost:8002")


@router.get("/admin/whatsapp/configs")
async def get_whatsapp_configs(adm=Depends(get_admin)):
    """Get all WhatsApp configurations (primary admin only)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    configs = await db.whatsapp_configs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Get status for each config from WhatsApp service
    async with httpx.AsyncClient(timeout=5.0) as client:
        for config in configs:
            try:
                resp = await client.get(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/status")
                if resp.status_code == 200:
                    status_data = resp.json()
                    config["connection_status"] = status_data.get("status", "unknown")
                    config["connection_info"] = status_data.get("info")
                else:
                    config["connection_status"] = "error"
            except Exception as e:
                config["connection_status"] = "service_unavailable"
    
    return {"configs": configs}


@router.post("/admin/whatsapp/configs")
async def create_whatsapp_config(req: WhatsAppConfigReq, adm=Depends(get_admin_with_kyc)):
    """Create a new WhatsApp configuration"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    # Check if session_id already exists
    existing = await db.whatsapp_configs.find_one({"session_id": req.session_id})
    if existing:
        raise HTTPException(400, "Un configuration avec cet identifiant existe déjà")
    
    # If setting as default, unset other defaults
    if req.is_default:
        await db.whatsapp_configs.update_many({}, {"$set": {"is_default": False}})
    
    config = {
        "id": gen_id(),
        "session_id": req.session_id,
        "name": req.name,
        "countries": req.countries,
        "is_default": req.is_default,
        "is_active": req.is_active,
        "config_type": req.config_type,  # "otp" ou "support"
        "created_at": now_iso(),
        "created_by": adm["id"]
    }
    
    await db.whatsapp_configs.insert_one(config)
    await log_admin_activity(adm, "create", "settings", details={"action": "whatsapp_config_create", "session_id": req.session_id})
    
    return {"message": "Configuration créée", "config": {k: v for k, v in config.items() if k != "_id"}}


@router.put("/admin/whatsapp/configs/{config_id}")
async def update_whatsapp_config(config_id: str, req: WhatsAppConfigReq, adm=Depends(get_admin_with_kyc)):
    """Update a WhatsApp configuration"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    # If setting as default, unset other defaults
    if req.is_default:
        await db.whatsapp_configs.update_many({"id": {"$ne": config_id}}, {"$set": {"is_default": False}})
    
    await db.whatsapp_configs.update_one(
        {"id": config_id},
        {"$set": {
            "name": req.name,
            "countries": req.countries,
            "is_default": req.is_default,
            "is_active": req.is_active,
            "config_type": req.config_type,
            "updated_at": now_iso()
        }}
    )
    
    await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_config_update", "config_id": config_id})
    
    return {"message": "Configuration mise à jour"}


@router.delete("/admin/whatsapp/configs/{config_id}")
async def delete_whatsapp_config(config_id: str, adm=Depends(get_admin_with_kyc)):
    """Delete a WhatsApp configuration"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    # Disconnect session from WhatsApp service
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            await client.delete(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}")
        except Exception:
            pass
    
    await db.whatsapp_configs.delete_one({"id": config_id})
    await log_admin_activity(adm, "delete", "settings", details={"action": "whatsapp_config_delete", "config_id": config_id})
    
    return {"message": "Configuration supprimée"}


@router.post("/admin/whatsapp/configs/{config_id}/connect")
async def connect_whatsapp_session(config_id: str, request: Request, adm=Depends(get_admin_with_kyc)):
    """Initialize WhatsApp connection for a config"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    method = body.get("method", "cloud_api")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{WHATSAPP_SERVICE_URL}/session/init",
                json={"sessionId": config["session_id"], "method": method}
            )
            result = resp.json()
            
            status = result.get("status", "initializing")
            await db.whatsapp_configs.update_one(
                {"id": config_id},
                {"$set": {
                    "connection_status": status,
                    "connection_info": {
                        "method": method,
                        "pairingCode": result.get("pairingCode"),
                        "initiatedAt": now_iso()
                    }
                }}
            )
            
            await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_connect", "session_id": config["session_id"], "method": method})
            
            return {"message": "Connexion initialisée", "result": result}
        except httpx.TimeoutException:
            await db.whatsapp_configs.update_one(
                {"id": config_id},
                {"$set": {"connection_status": "initializing", "connection_info": {"method": method, "initiatedAt": now_iso()}}}
            )
            return {"message": "Connexion en cours d'initialisation", "status": "initializing"}
        except Exception as e:
            return {"message": "Service WhatsApp non disponible", "status": "service_unavailable", "error": str(e)}


@router.get("/admin/whatsapp/configs/{config_id}/qr")
async def get_whatsapp_qr(config_id: str, adm=Depends(get_admin)):
    """Get QR code for a WhatsApp session — retries internally if browser is still loading"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    # Try up to 3 times with 2s intervals within a single request
    async with httpx.AsyncClient(timeout=10.0) as client:
        for attempt in range(3):
            try:
                resp = await client.get(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/qr")
                data = resp.json()
                status = data.get("status")
                # Return immediately if QR is ready, connected, or errored
                if status in ("qr_ready", "ready", "error", "qr_expired"):
                    return data
                # If still initializing/loading, wait and retry
                if attempt < 2:
                    import asyncio
                    await asyncio.sleep(2)
            except Exception as e:
                if attempt == 2:
                    return {"status": "service_unavailable", "error": str(e)}
                import asyncio
                await asyncio.sleep(2)
    return {"status": "initializing", "message": "Le navigateur est en cours de lancement"}


@router.get("/admin/whatsapp/configs/{config_id}/status")
async def get_whatsapp_status(config_id: str, adm=Depends(get_admin)):
    """Get status of a WhatsApp session"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/status")
            return resp.json()
        except Exception as e:
            return {"status": "service_unavailable", "error": str(e)}


@router.post("/admin/whatsapp/configs/{config_id}/disconnect")
async def disconnect_whatsapp_session(config_id: str, adm=Depends(get_admin_with_kyc)):
    """Disconnect a WhatsApp session"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/disconnect")
            result = resp.json()
            
            # Update config status in DB
            await db.whatsapp_configs.update_one(
                {"id": config_id},
                {"$set": {"connection_status": "disconnected", "connection_info": None}}
            )
            
            await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_disconnect", "session_id": config["session_id"]})
            
            return result
        except Exception as e:
            # Graceful fallback if service is down
            await db.whatsapp_configs.update_one(
                {"id": config_id},
                {"$set": {"connection_status": "disconnected", "connection_info": None}}
            )
            return {"success": True, "message": "Déconnexion locale effectuée"}


@router.post("/admin/whatsapp/configs/{config_id}/configure")
async def configure_whatsapp_connection(config_id: str, req: WhatsAppConfigureReq, adm=Depends(get_admin_with_kyc)):
    """Configure WhatsApp Cloud API credentials or phone link"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if req.method == "cloud_api":
                # Configure Cloud API
                resp = await client.post(
                    f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/configure",
                    json={
                        "phoneNumberId": req.phoneNumberId,
                        "accessToken": req.accessToken,
                        "businessAccountId": req.businessAccountId
                    }
                )
                result = resp.json()
                
                if result.get("success"):
                    # Update config in DB
                    await db.whatsapp_configs.update_one(
                        {"id": config_id},
                        {"$set": {
                            "connection_status": "ready",
                            "connection_info": {
                                "method": "cloud_api",
                                "phoneNumber": result.get("phoneNumber"),
                                "phoneNumberId": req.phoneNumberId,
                                "configuredAt": now_iso()
                            }
                        }}
                    )
                    await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_cloud_api_configured", "session_id": config["session_id"]})
                    
                return result
            else:
                # Phone link method
                raise HTTPException(400, "Utilisez l'endpoint /connect pour la liaison par numéro")
        except httpx.TimeoutException:
            return {"success": False, "error": "Timeout lors de la configuration"}
        except HTTPException:
            raise
        except Exception as e:
            return {"success": False, "error": f"Service WhatsApp non disponible: {str(e)}"}


@router.post("/admin/whatsapp/configs/{config_id}/confirm-pairing")
async def confirm_whatsapp_pairing(config_id: str, adm=Depends(get_admin_with_kyc)):
    """Confirm phone pairing after user links device"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/confirm-pairing")
            result = resp.json()
            
            if result.get("success") and result.get("status") == "ready":
                # Update config in DB
                await db.whatsapp_configs.update_one(
                    {"id": config_id},
                    {"$set": {
                        "connection_status": "ready",
                        "connection_info": {
                            "method": "phone_link",
                            "confirmedAt": now_iso()
                        }
                    }}
                )
                await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_phone_paired", "session_id": config["session_id"]})
            
            return result
        except Exception as e:
            return {"success": False, "status": "service_unavailable", "error": str(e)}


@router.post("/admin/whatsapp/configs/{config_id}/check-connection")
async def check_whatsapp_connection(config_id: str, adm=Depends(get_admin_with_kyc)):
    """Check if WhatsApp is connected — on-demand check, no polling"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/check-connection")
            result = resp.json()
            
            if result.get("status") == "ready" and result.get("connected"):
                await db.whatsapp_configs.update_one(
                    {"id": config_id},
                    {"$set": {
                        "connection_status": "ready",
                        "connection_info": {
                            "method": "qr_code",
                            "confirmedAt": now_iso()
                        }
                    }}
                )
                await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_connected", "session_id": config["session_id"]})
            
            return result
        except Exception as e:
            return {"status": "service_unavailable", "connected": False, "error": str(e)}


@router.post("/admin/whatsapp/configs/{config_id}/pairing-code")
async def request_whatsapp_pairing_code(config_id: str, req: WhatsAppPairingCodeReq, adm=Depends(get_admin_with_kyc)):
    """Request a pairing code for phone number authentication"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/pairing-code",
                json={
                    "countryCode": req.countryCode,
                    "phoneNumber": req.phoneNumber
                }
            )
            result = resp.json()
            
            if result.get("code"):
                # Update config status
                await db.whatsapp_configs.update_one(
                    {"id": config_id},
                    {"$set": {
                        "connection_status": "pairing_code_ready",
                        "connection_info": {
                            "method": "phone_pairing",
                            "phone": f"{req.countryCode}{req.phoneNumber}",
                            "codeRequestedAt": now_iso()
                        }
                    }}
                )
                await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_pairing_code_requested", "session_id": config["session_id"]})
            
            return result
        except httpx.TimeoutException:
            return {"status": "timeout", "error": "Le client WhatsApp met du temps à générer le code"}
        except Exception as e:
            return {"status": "service_unavailable", "error": str(e)}


@router.get("/admin/whatsapp/methods")
async def get_whatsapp_connection_methods(adm=Depends(get_admin)):
    """Get available WhatsApp connection methods"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{WHATSAPP_SERVICE_URL}/methods")
            return resp.json()
        except Exception:
            return {
                "methods": [
                    {"id": "qr_code", "name": "QR Code", "description": "Scannez le QR code avec WhatsApp", "recommended": True},
                    {"id": "phone_pairing", "name": "Numéro de téléphone", "description": "Liaison par code avec numéro de téléphone"},
                    {"id": "cloud_api", "name": "Cloud API", "description": "API officielle Meta Business", "production": True}
                ]
            }


@router.get("/admin/whatsapp/scraper-countries")
async def get_whatsapp_scraper_countries(adm=Depends(get_admin)):
    """Get country list from WhatsApp Web scraper service"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{WHATSAPP_SERVICE_URL}/countries")
            return resp.json()
        except Exception as e:
            return {"countries": [], "source": "error", "error": str(e)}


@router.post("/admin/whatsapp/configs/{config_id}/refresh-qr")
async def refresh_whatsapp_qr(config_id: str, adm=Depends(get_admin_with_kyc)):
    """Manually refresh QR code for a WhatsApp session"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvée")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/refresh-qr")
            return resp.json()
        except Exception as e:
            return {"status": "service_unavailable", "error": str(e)}


@router.post("/admin/whatsapp/test-send")
async def test_whatsapp_send(req: WhatsAppSendReq, adm=Depends(get_admin_with_kyc)):
    """Send a test WhatsApp message"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    result = await send_whatsapp_message(req.phone, req.message, req.country_code)
    
    await log_admin_activity(adm, "create", "settings", details={"action": "whatsapp_test_send", "phone": req.phone[:6] + "***"})
    
    return result


@router.post("/admin/whatsapp/configs/{config_id}/validate-send")
async def validate_whatsapp_config_send(config_id: str, req: WhatsAppValidateReq, adm=Depends(get_admin_with_kyc)):
    """Send a validation OTP code to a phone number to test a WhatsApp config"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut acceder a cette fonctionnalite")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvee")
    
    code = str(random.randint(100000, 999999))
    message = f"[Monity World] Code de validation: {code}\nCe code confirme que votre configuration WhatsApp fonctionne correctement."
    
    # Send via the specific config's session
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{WHATSAPP_SERVICE_URL}/send",
                json={
                    "sessionId": config["session_id"],
                    "phone": req.phone,
                    "message": message
                }
            )
            result = resp.json()
            
            if result.get("success"):
                # Store the validation code
                await db.whatsapp_configs.update_one(
                    {"id": config_id},
                    {"$set": {
                        "validation_code": code,
                        "validation_phone": req.phone,
                        "validation_sent_at": now_iso()
                    }}
                )
                await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_validate_send", "config_id": config_id, "phone": req.phone[:6] + "***"})
                return {"success": True, "message": f"Code envoye au {req.phone}", "code_length": 6}
            else:
                return {"success": False, "error": result.get("error", "Echec de l'envoi")}
        except httpx.TimeoutException:
            return {"success": False, "error": "Timeout - l'envoi prend trop de temps"}
        except Exception as e:
            return {"success": False, "error": str(e)}


@router.post("/admin/whatsapp/configs/{config_id}/validate-confirm")
async def validate_whatsapp_config_confirm(config_id: str, req: WhatsAppValidateConfirmReq, adm=Depends(get_admin_with_kyc)):
    """Confirm a validation code was received — marks config as validated"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut acceder a cette fonctionnalite")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvee")
    
    stored_code = config.get("validation_code")
    if not stored_code:
        return {"success": False, "error": "Aucun code de validation en attente. Envoyez d'abord un code."}
    
    if req.code.strip() != stored_code:
        return {"success": False, "error": "Code incorrect"}
    
    # Mark config as validated
    await db.whatsapp_configs.update_one(
        {"id": config_id},
        {"$set": {
            "validated": True,
            "validated_at": now_iso(),
            "validated_phone": config.get("validation_phone")
        }, "$unset": {
            "validation_code": "",
            "validation_phone": "",
            "validation_sent_at": ""
        }}
    )
    
    await log_admin_activity(adm, "update", "settings", details={"action": "whatsapp_config_validated", "config_id": config_id})
    
    return {"success": True, "message": "Configuration validee avec succes !"}


@router.post("/admin/whatsapp/configs/{config_id}/test-cloud-api")
async def test_whatsapp_cloud_api(config_id: str, req: WhatsAppCloudApiTestReq, adm=Depends(get_admin_with_kyc)):
    """Test WhatsApp Cloud API configuration by sending a test message"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut tester cette API")
    
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvee")
    
    cloud_config = config.get("cloud_api_config")
    if not cloud_config:
        raise HTTPException(400, "Cette configuration n'a pas de Cloud API configuree. Configurez d'abord les identifiants Meta Business.")
    
    phone_number_id = cloud_config.get("phone_number_id")
    access_token = cloud_config.get("access_token")
    
    if not phone_number_id or not access_token:
        raise HTTPException(400, "Identifiants Cloud API incomplets (phone_number_id ou access_token manquant)")
    
    # Format phone number (remove + and spaces)
    phone = req.phone_number.replace("+", "").replace(" ", "").replace("-", "")
    
    # Call WhatsApp Cloud API
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # WhatsApp Cloud API endpoint
            url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
            
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone,
                "type": "text",
                "text": {
                    "preview_url": False,
                    "body": req.message
                }
            }
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            resp = await client.post(url, json=payload, headers=headers)
            result = resp.json()
            
            if resp.status_code == 200 and result.get("messages"):
                message_id = result["messages"][0].get("id")
                
                # Log success
                await db.whatsapp_logs.insert_one({
                    "id": gen_id(),
                    "config_id": config_id,
                    "type": "cloud_api_test",
                    "phone": phone[:6] + "***",
                    "message_id": message_id,
                    "status": "sent",
                    "created_at": now_iso(),
                    "created_by": adm["id"]
                })
                
                await log_admin_activity(adm, "update", "settings", details={
                    "action": "whatsapp_cloud_api_test", 
                    "config_id": config_id, 
                    "phone": phone[:6] + "***",
                    "success": True
                })
                
                return {
                    "success": True,
                    "message": f"Message envoye avec succes via Cloud API",
                    "message_id": message_id,
                    "phone": phone[:6] + "***"
                }
            else:
                error_msg = result.get("error", {}).get("message", "Erreur inconnue")
                error_code = result.get("error", {}).get("code", "N/A")
                
                # Log failure
                await db.whatsapp_logs.insert_one({
                    "id": gen_id(),
                    "config_id": config_id,
                    "type": "cloud_api_test",
                    "phone": phone[:6] + "***",
                    "status": "failed",
                    "error": error_msg,
                    "error_code": error_code,
                    "created_at": now_iso(),
                    "created_by": adm["id"]
                })
                
                return {
                    "success": False,
                    "error": error_msg,
                    "error_code": error_code,
                    "details": "Verifiez vos identifiants Meta Business et que le numero est enregistre dans WhatsApp Business"
                }
                
        except httpx.TimeoutException:
            return {"success": False, "error": "Timeout - la requete a pris trop de temps"}
        except Exception as e:
            return {"success": False, "error": str(e)}


@router.get("/admin/whatsapp/configs/{config_id}/cloud-api-status")
async def get_cloud_api_status(config_id: str, adm=Depends(get_admin)):
    """Get Cloud API configuration status for a config"""
    config = await db.whatsapp_configs.find_one({"id": config_id})
    if not config:
        raise HTTPException(404, "Configuration non trouvee")
    
    cloud_config = config.get("cloud_api_config", {})
    
    return {
        "has_cloud_api": bool(cloud_config),
        "phone_number_id": cloud_config.get("phone_number_id", "")[:10] + "..." if cloud_config.get("phone_number_id") else None,
        "has_access_token": bool(cloud_config.get("access_token")),
        "business_account_id": cloud_config.get("business_account_id"),
        "configured_at": cloud_config.get("configured_at"),
        "last_test": None  # Could add last test result here
    }


async def get_whatsapp_config_for_country(country_code: str, config_type: str = "otp") -> Optional[dict]:
    """Get the appropriate WhatsApp config for a country
    
    Args:
        country_code: The country code (e.g., "CD", "FR")
        config_type: Either "otp" for OTP/notifications or "support" for customer support
    """
    # First, try to find a config that specifically includes this country
    config = await db.whatsapp_configs.find_one({
        "is_active": True,
        "config_type": config_type,
        "countries": {"$in": [country_code.upper()]}
    })
    
    if config:
        return config
    
    # If not found, look for a wildcard config
    config = await db.whatsapp_configs.find_one({
        "is_active": True,
        "config_type": config_type,
        "countries": {"$in": ["*"]}
    })
    
    if config:
        return config
    
    # Finally, try the default config of this type
    config = await db.whatsapp_configs.find_one({
        "is_active": True,
        "config_type": config_type,
        "is_default": True
    })
    
    return config


async def send_whatsapp_otp(phone: str, otp: str, is_2fa: bool = False) -> dict:
    """Send OTP via WhatsApp for registration or 2FA"""
    if is_2fa:
        message = f"Monity World - Double authentification\\n\\nVotre code de vérification: {otp}\\n\\nCe code expire dans 10 minutes.\\n\\nSi vous n'avez pas essayé de vous connecter, sécurisez immédiatement votre compte."
    else:
        message = f"Monity World - Vérification\\n\\nVotre code OTP: {otp}\\n\\nEntrez ce code pour vérifier votre compte.\\n\\nCe code expire dans 10 minutes."
    
    return await send_whatsapp_message(phone, message)


async def send_whatsapp_message(phone: str, message: str, country_code: str = None) -> dict:
    """
    Send a WhatsApp message using the appropriate config for the country.
    This is the main function to be called from other parts of the app.
    """
    # Try to detect country from phone if not provided
    if not country_code:
        # Simple detection based on phone prefix
        phone_clean = phone.replace("+", "").replace(" ", "")
        if phone_clean.startswith("243"):
            country_code = "CD"
        elif phone_clean.startswith("242"):
            country_code = "CG"
        elif phone_clean.startswith("237"):
            country_code = "CM"
        elif phone_clean.startswith("225"):
            country_code = "CI"
        elif phone_clean.startswith("221"):
            country_code = "SN"
        elif phone_clean.startswith("33"):
            country_code = "FR"
        else:
            country_code = "UNKNOWN"
    
    # Get appropriate config
    config = await get_whatsapp_config_for_country(country_code)
    
    if not config:
        return {"success": False, "error": "Aucune configuration WhatsApp disponible pour ce pays", "fallback": "sms"}
    
    # Send via WhatsApp service
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{WHATSAPP_SERVICE_URL}/send",
                json={
                    "sessionId": config["session_id"],
                    "phone": phone,
                    "message": message
                }
            )
            
            if resp.status_code == 200:
                result = resp.json()
                # Log successful send
                await db.whatsapp_logs.insert_one({
                    "id": gen_id(),
                    "config_id": config["id"],
                    "session_id": config["session_id"],
                    "phone": phone[:6] + "***",
                    "message_preview": message[:50] + "..." if len(message) > 50 else message,
                    "status": "sent",
                    "message_id": result.get("messageId"),
                    "created_at": now_iso()
                })
                return {"success": True, "message_id": result.get("messageId"), "via": "whatsapp"}
            else:
                error = resp.json().get("error", "Unknown error")
                await db.whatsapp_logs.insert_one({
                    "id": gen_id(),
                    "config_id": config["id"],
                    "phone": phone[:6] + "***",
                    "status": "failed",
                    "error": error,
                    "created_at": now_iso()
                })
                return {"success": False, "error": error, "fallback": "sms"}
                
        except Exception as e:
            return {"success": False, "error": str(e), "fallback": "sms"}


async def send_otp_via_whatsapp(phone: str, otp: str, otp_type: str = "verification") -> dict:
    """Send OTP code via WhatsApp using customizable templates"""
    # Get template from DB or use default
    template = await get_otp_template(otp_type)
    
    # Format message with code and validity
    message = template["message_template"].replace("{code}", otp).replace("{validity}", str(template["validity_minutes"]))
    
    return await send_whatsapp_message(phone, message)


async def send_transaction_notification_whatsapp(phone: str, transaction_type: str, amount: float, currency: str, recipient: str = None, balance: float = None) -> dict:
    """Send transaction notification via WhatsApp"""
    if transaction_type == "send":
        message = f"""💸 *Monity World - Transfert Envoyé*

Vous avez envoyé *{amount:,.2f} {currency}* à {recipient}.

{"Nouveau solde: *" + f"{balance:,.2f} {currency}*" if balance is not None else ""}

_Monity World - Votre portefeuille digital sécurisé_"""
    elif transaction_type == "receive":
        message = f"""💰 *Monity World - Transfert Reçu*

Vous avez reçu *{amount:,.2f} {currency}*{" de " + recipient if recipient else ""}.

{"Nouveau solde: *" + f"{balance:,.2f} {currency}*" if balance is not None else ""}

_Monity World - Votre portefeuille digital sécurisé_"""
    elif transaction_type == "deposit":
        message = f"""🏦 *Monity World - Dépôt Confirmé*

Votre dépôt de *{amount:,.2f} {currency}* a été confirmé.

{"Nouveau solde: *" + f"{balance:,.2f} {currency}*" if balance is not None else ""}

_Monity World - Votre portefeuille digital sécurisé_"""
    elif transaction_type == "withdrawal":
        message = f"""🏧 *Monity World - Retrait Confirmé*

Votre retrait de *{amount:,.2f} {currency}* a été traité.

{"Nouveau solde: *" + f"{balance:,.2f} {currency}*" if balance is not None else ""}

_Monity World - Votre portefeuille digital sécurisé_"""
    else:
        message = f"""📱 *Monity World - Transaction*

Transaction de *{amount:,.2f} {currency}* effectuée.

_Monity World - Votre portefeuille digital sécurisé_"""
    
    return await send_whatsapp_message(phone, message)


@router.get("/admin/whatsapp/logs")
async def get_whatsapp_logs(
    page: int = 1, 
    limit: int = 50,
    status: str = None,
    adm=Depends(get_admin)
):
    """Get WhatsApp message logs"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    query = {}
    if status:
        query["status"] = status
    
    skip = (page - 1) * limit
    total = await db.whatsapp_logs.count_documents(query)
    logs = await db.whatsapp_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "logs": logs,
        "total": total,
        "page": page,
        "pages": -(-total // limit)
    }


@router.get("/admin/whatsapp/stats")
async def get_whatsapp_stats(adm=Depends(get_admin)):
    """Get WhatsApp usage statistics"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    # Get counts by status
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    status_counts = await db.whatsapp_logs.aggregate(pipeline).to_list(10)
    
    # Get daily counts for last 30 days
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    daily_pipeline = [
        {"$match": {"created_at": {"$gte": thirty_days_ago}}},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},
            "sent": {"$sum": {"$cond": [{"$eq": ["$status", "sent"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_stats = await db.whatsapp_logs.aggregate(daily_pipeline).to_list(30)
    
    # Get active configs count
    active_configs = await db.whatsapp_configs.count_documents({"is_active": True})
    
    return {
        "by_status": {s["_id"]: s["count"] for s in status_counts},
        "daily": [{"date": d["_id"], "sent": d["sent"], "failed": d["failed"]} for d in daily_stats],
        "active_configs": active_configs,
        "total_messages": sum(s["count"] for s in status_counts)
    }


@router.get("/admin/whatsapp/support-numbers")
async def get_support_numbers(adm=Depends(get_admin)):
    """Get all WhatsApp support numbers (for customer service)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    configs = await db.whatsapp_configs.find(
        {"config_type": "support", "is_active": True},
        {"_id": 0}
    ).to_list(50)
    
    # Get status for each config
    async with httpx.AsyncClient(timeout=5.0) as client:
        for config in configs:
            try:
                resp = await client.get(f"{WHATSAPP_SERVICE_URL}/session/{config['session_id']}/status")
                if resp.status_code == 200:
                    status_data = resp.json()
                    config["connection_status"] = status_data.get("status", "unknown")
                    config["connection_info"] = status_data.get("info")
                else:
                    config["connection_status"] = "error"
            except Exception:
                config["connection_status"] = "service_unavailable"
    
    return {"support_numbers": configs}


# === OTP TEMPLATES MANAGEMENT ===
@router.get("/admin/whatsapp/otp-templates")
async def get_otp_templates(adm=Depends(get_admin)):
    """Get all OTP message templates"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    templates = await db.whatsapp_otp_templates.find({}, {"_id": 0}).sort("template_name", 1).to_list(20)
    
    # Return defaults if no templates exist
    if not templates:
        defaults = get_default_otp_templates()
        return {"templates": defaults, "is_default": True}
    
    return {"templates": templates, "is_default": False}


@router.post("/admin/whatsapp/otp-templates")
async def create_or_update_otp_template(req: WhatsAppOTPTemplateReq, adm=Depends(get_admin_with_kyc)):
    """Create or update an OTP template"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    if "{code}" not in req.message_template:
        raise HTTPException(400, "Le template doit contenir le placeholder {code}")
    
    existing = await db.whatsapp_otp_templates.find_one({"template_name": req.template_name})
    
    template_data = {
        "template_name": req.template_name,
        "message_template": req.message_template,
        "validity_minutes": req.validity_minutes,
        "is_active": req.is_active,
        "updated_at": now_iso(),
        "updated_by": adm["id"]
    }
    
    if existing:
        await db.whatsapp_otp_templates.update_one(
            {"template_name": req.template_name},
            {"$set": template_data}
        )
        await log_admin_activity(adm, "update", "settings", details={"action": "otp_template_update", "template": req.template_name})
        return {"message": "Template mis à jour"}
    else:
        template_data["id"] = gen_id()
        template_data["created_at"] = now_iso()
        template_data["created_by"] = adm["id"]
        await db.whatsapp_otp_templates.insert_one(template_data)
        await log_admin_activity(adm, "create", "settings", details={"action": "otp_template_create", "template": req.template_name})
        return {"message": "Template créé", "template": {k: v for k, v in template_data.items() if k != "_id"}}


@router.delete("/admin/whatsapp/otp-templates/{template_name}")
async def delete_otp_template(template_name: str, adm=Depends(get_admin_with_kyc)):
    """Delete an OTP template (will revert to default)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut accéder à cette fonctionnalité")
    
    result = await db.whatsapp_otp_templates.delete_one({"template_name": template_name})
    if result.deleted_count == 0:
        raise HTTPException(404, "Template non trouvé")
    
    await log_admin_activity(adm, "delete", "settings", details={"action": "otp_template_delete", "template": template_name})
    return {"message": "Template supprimé, le template par défaut sera utilisé"}


def get_default_otp_templates():
    """Return default OTP templates"""
    return [
        {
            "template_name": "verification",
            "message_template": """🔐 *Monity World - Code de Vérification*

Votre code de vérification est: *{code}*

Ce code expire dans {validity} minutes.

⚠️ Ne partagez jamais ce code avec qui que ce soit.

_Monity World - Votre portefeuille digital sécurisé_""",
            "validity_minutes": 5,
            "is_active": True,
            "is_default": True
        },
        {
            "template_name": "transaction",
            "message_template": """💳 *Monity World - Confirmation de Transaction*

Votre code de confirmation est: *{code}*

Ce code expire dans {validity} minutes.

⚠️ Si vous n'avez pas initié cette transaction, ignorez ce message.

_Monity World - Votre portefeuille digital sécurisé_""",
            "validity_minutes": 5,
            "is_active": True,
            "is_default": True
        },
        {
            "template_name": "login",
            "message_template": """🔑 *Monity World - Code de Connexion*

Votre code de connexion est: *{code}*

Ce code expire dans {validity} minutes.

⚠️ Ne partagez jamais ce code avec qui que ce soit.

_Monity World - Votre portefeuille digital sécurisé_""",
            "validity_minutes": 5,
            "is_active": True,
            "is_default": True
        }
    ]


async def get_otp_template(template_name: str) -> dict:
    """Get OTP template from DB or return default"""
    template = await db.whatsapp_otp_templates.find_one({"template_name": template_name, "is_active": True})
    if template:
        return {
            "message_template": template["message_template"],
            "validity_minutes": template.get("validity_minutes", 5)
        }
    
    # Return default
    defaults = get_default_otp_templates()
    for t in defaults:
        if t["template_name"] == template_name:
            return {
                "message_template": t["message_template"],
                "validity_minutes": t["validity_minutes"]
            }
    
    # Fallback generic
    return {
        "message_template": "*Monity World*\n\nVotre code est: *{code}*\n\nCe code expire dans {validity} minutes.\n\n_Monity World_",
        "validity_minutes": 5
    }

