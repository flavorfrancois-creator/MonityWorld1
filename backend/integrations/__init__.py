"""
Monity World - External Integrations Module
==========================================
Centralized API integration system for SMS, Mobile Money, and Payment providers.
Supports major African telecom operators and financial services.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum
import os
import logging
import httpx
import hashlib
import hmac
import base64
from datetime import datetime, timezone
import uuid

logger = logging.getLogger(__name__)


# ===========================================
# ENUMS AND DATA CLASSES
# ===========================================

class SMSProvider(str, Enum):
    AFRICAS_TALKING = "africas_talking"
    TWILIO = "twilio"

class MobileMoneyProvider(str, Enum):
    MTN_MOMO = "mtn_momo"
    ORANGE_MONEY = "orange_money"
    AIRTEL_MONEY = "airtel_money"
    MPESA = "mpesa"
    WAVE = "wave"

class TransactionType(str, Enum):
    COLLECTION = "collection"  # Receive money from user
    DISBURSEMENT = "disbursement"  # Send money to user

class TransactionStatus(str, Enum):
    PENDING = "pending"
    SUCCESSFUL = "successful"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class SMSResult:
    success: bool
    message_id: Optional[str] = None
    provider: Optional[str] = None
    cost: Optional[float] = None
    error: Optional[str] = None


@dataclass
class MobileMoneyResult:
    success: bool
    transaction_id: Optional[str] = None
    external_id: Optional[str] = None
    provider: Optional[str] = None
    status: TransactionStatus = TransactionStatus.PENDING
    amount: Optional[float] = None
    currency: Optional[str] = None
    error: Optional[str] = None


@dataclass
class CountryConfig:
    code: str
    name: str
    dial_code: str
    currency: str
    sms_providers: List[SMSProvider]
    mobile_money_providers: List[MobileMoneyProvider]


# ===========================================
# COUNTRY CONFIGURATION
# ===========================================

COUNTRY_INTEGRATIONS: Dict[str, CountryConfig] = {
    # Central Africa
    "CD": CountryConfig(
        code="CD", name="RD Congo", dial_code="+243", currency="CDF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.ORANGE_MONEY, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "CG": CountryConfig(
        code="CG", name="Congo-Brazzaville", dial_code="+242", currency="XAF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "CM": CountryConfig(
        code="CM", name="Cameroun", dial_code="+237", currency="XAF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.ORANGE_MONEY]
    ),
    "GA": CountryConfig(
        code="GA", name="Gabon", dial_code="+241", currency="XAF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "CF": CountryConfig(
        code="CF", name="Centrafrique", dial_code="+236", currency="XAF",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY]
    ),
    "TD": CountryConfig(
        code="TD", name="Tchad", dial_code="+235", currency="XAF",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.AIRTEL_MONEY]
    ),
    
    # West Africa
    "SN": CountryConfig(
        code="SN", name="Sénégal", dial_code="+221", currency="XOF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY, MobileMoneyProvider.WAVE]
    ),
    "CI": CountryConfig(
        code="CI", name="Côte d'Ivoire", dial_code="+225", currency="XOF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.ORANGE_MONEY, MobileMoneyProvider.WAVE]
    ),
    "ML": CountryConfig(
        code="ML", name="Mali", dial_code="+223", currency="XOF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY]
    ),
    "BF": CountryConfig(
        code="BF", name="Burkina Faso", dial_code="+226", currency="XOF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY]
    ),
    "NE": CountryConfig(
        code="NE", name="Niger", dial_code="+227", currency="XOF",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.AIRTEL_MONEY, MobileMoneyProvider.ORANGE_MONEY]
    ),
    "BJ": CountryConfig(
        code="BJ", name="Bénin", dial_code="+229", currency="XOF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO]
    ),
    "TG": CountryConfig(
        code="TG", name="Togo", dial_code="+228", currency="XOF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO]
    ),
    "GN": CountryConfig(
        code="GN", name="Guinée", dial_code="+224", currency="GNF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY, MobileMoneyProvider.MTN_MOMO]
    ),
    "NG": CountryConfig(
        code="NG", name="Nigeria", dial_code="+234", currency="NGN",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "GH": CountryConfig(
        code="GH", name="Ghana", dial_code="+233", currency="GHS",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.AIRTEL_MONEY, MobileMoneyProvider.MPESA]
    ),
    
    # East Africa
    "KE": CountryConfig(
        code="KE", name="Kenya", dial_code="+254", currency="KES",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MPESA, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "UG": CountryConfig(
        code="UG", name="Ouganda", dial_code="+256", currency="UGX",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "TZ": CountryConfig(
        code="TZ", name="Tanzanie", dial_code="+255", currency="TZS",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MPESA, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "RW": CountryConfig(
        code="RW", name="Rwanda", dial_code="+250", currency="RWF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "BI": CountryConfig(
        code="BI", name="Burundi", dial_code="+257", currency="BIF",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "ET": CountryConfig(
        code="ET", name="Éthiopie", dial_code="+251", currency="ETB",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[]  # Telebirr - proprietary
    ),
    
    # Southern Africa
    "ZA": CountryConfig(
        code="ZA", name="Afrique du Sud", dial_code="+27", currency="ZAR",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO]
    ),
    "ZM": CountryConfig(
        code="ZM", name="Zambie", dial_code="+260", currency="ZMW",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MTN_MOMO, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "MW": CountryConfig(
        code="MW", name="Malawi", dial_code="+265", currency="MWK",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "MZ": CountryConfig(
        code="MZ", name="Mozambique", dial_code="+258", currency="MZN",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.MPESA]
    ),
    "AO": CountryConfig(
        code="AO", name="Angola", dial_code="+244", currency="AOA",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
    
    # North Africa
    "MA": CountryConfig(
        code="MA", name="Maroc", dial_code="+212", currency="MAD",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY]
    ),
    "DZ": CountryConfig(
        code="DZ", name="Algérie", dial_code="+213", currency="DZD",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
    "TN": CountryConfig(
        code="TN", name="Tunisie", dial_code="+216", currency="TND",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY]
    ),
    "EG": CountryConfig(
        code="EG", name="Égypte", dial_code="+20", currency="EGP",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY]
    ),
    
    # Island Nations
    "MG": CountryConfig(
        code="MG", name="Madagascar", dial_code="+261", currency="MGA",
        sms_providers=[SMSProvider.AFRICAS_TALKING, SMSProvider.TWILIO],
        mobile_money_providers=[MobileMoneyProvider.ORANGE_MONEY, MobileMoneyProvider.AIRTEL_MONEY]
    ),
    "MU": CountryConfig(
        code="MU", name="Maurice", dial_code="+230", currency="MUR",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
    
    # International (Diaspora)
    "CA": CountryConfig(
        code="CA", name="Canada", dial_code="+1", currency="CAD",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
    "MX": CountryConfig(
        code="MX", name="Mexique", dial_code="+52", currency="MXN",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
    "FR": CountryConfig(
        code="FR", name="France", dial_code="+33", currency="EUR",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
    "BE": CountryConfig(
        code="BE", name="Belgique", dial_code="+32", currency="EUR",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
    "US": CountryConfig(
        code="US", name="États-Unis", dial_code="+1", currency="USD",
        sms_providers=[SMSProvider.TWILIO],
        mobile_money_providers=[]
    ),
}


def get_country_config(country_code: str) -> Optional[CountryConfig]:
    """Get integration configuration for a country"""
    return COUNTRY_INTEGRATIONS.get(country_code.upper())


def get_available_providers_for_country(country_code: str) -> Dict[str, List[str]]:
    """Get available SMS and Mobile Money providers for a country"""
    config = get_country_config(country_code)
    if not config:
        return {"sms": [], "mobile_money": []}
    return {
        "sms": [p.value for p in config.sms_providers],
        "mobile_money": [p.value for p in config.mobile_money_providers]
    }


# ===========================================
# SMS PROVIDERS
# ===========================================

class BaseSMSProvider(ABC):
    """Base class for SMS providers"""
    
    @abstractmethod
    async def send_sms(self, phone: str, message: str, sender_id: Optional[str] = None) -> SMSResult:
        pass
    
    @abstractmethod
    async def check_balance(self) -> Dict[str, Any]:
        pass


class AfricasTalkingSMS(BaseSMSProvider):
    """Africa's Talking SMS Provider - Recommended for African countries"""
    
    def __init__(self):
        self.username = os.environ.get("AFRICAS_TALKING_USERNAME", "sandbox")
        self.api_key = os.environ.get("AFRICAS_TALKING_API_KEY", "")
        self.sender_id = os.environ.get("AFRICAS_TALKING_SENDER_ID", "")
        self.base_url = "https://api.africastalking.com/version1"
        if self.username == "sandbox":
            self.base_url = "https://api.sandbox.africastalking.com/version1"
    
    async def send_sms(self, phone: str, message: str, sender_id: Optional[str] = None) -> SMSResult:
        """Send SMS via Africa's Talking API"""
        if not self.api_key:
            return SMSResult(success=False, error="Africa's Talking API key not configured")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/messaging",
                    headers={
                        "apiKey": self.api_key,
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json"
                    },
                    data={
                        "username": self.username,
                        "to": phone,
                        "message": message,
                        "from": sender_id or self.sender_id or None
                    }
                )
                
                if response.status_code == 201:
                    data = response.json()
                    recipients = data.get("SMSMessageData", {}).get("Recipients", [])
                    if recipients:
                        recipient = recipients[0]
                        return SMSResult(
                            success=recipient.get("status") == "Success",
                            message_id=recipient.get("messageId"),
                            provider="africas_talking",
                            cost=float(recipient.get("cost", "0").replace("KES ", "").replace("USD ", "")),
                            error=recipient.get("status") if recipient.get("status") != "Success" else None
                        )
                
                return SMSResult(success=False, error=f"API Error: {response.text}")
                
        except Exception as e:
            logger.error(f"Africa's Talking SMS error: {e}")
            return SMSResult(success=False, error=str(e))
    
    async def check_balance(self) -> Dict[str, Any]:
        """Check account balance"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/user?username={self.username}",
                    headers={"apiKey": self.api_key, "Accept": "application/json"}
                )
                return response.json() if response.status_code == 200 else {"error": response.text}
        except Exception as e:
            return {"error": str(e)}


class TwilioSMS(BaseSMSProvider):
    """Twilio SMS Provider - Global coverage, backup provider"""
    
    def __init__(self):
        self.account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.from_number = os.environ.get("TWILIO_PHONE_NUMBER", "")
        self.base_url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}"
    
    async def send_sms(self, phone: str, message: str, sender_id: Optional[str] = None) -> SMSResult:
        """Send SMS via Twilio API"""
        if not self.account_sid or not self.auth_token:
            return SMSResult(success=False, error="Twilio credentials not configured")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/Messages.json",
                    auth=(self.account_sid, self.auth_token),
                    data={
                        "To": phone,
                        "From": sender_id or self.from_number,
                        "Body": message
                    }
                )
                
                if response.status_code == 201:
                    data = response.json()
                    return SMSResult(
                        success=True,
                        message_id=data.get("sid"),
                        provider="twilio",
                        cost=float(data.get("price", 0) or 0)
                    )
                
                return SMSResult(success=False, error=f"Twilio Error: {response.text}")
                
        except Exception as e:
            logger.error(f"Twilio SMS error: {e}")
            return SMSResult(success=False, error=str(e))
    
    async def check_balance(self) -> Dict[str, Any]:
        """Check account balance"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/Balance.json",
                    auth=(self.account_sid, self.auth_token)
                )
                return response.json() if response.status_code == 200 else {"error": response.text}
        except Exception as e:
            return {"error": str(e)}


# ===========================================
# MOBILE MONEY PROVIDERS
# ===========================================

class BaseMobileMoneyProvider(ABC):
    """Base class for Mobile Money providers"""
    
    @abstractmethod
    async def request_payment(
        self, phone: str, amount: float, currency: str, 
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Request payment from user (Collection)"""
        pass
    
    @abstractmethod
    async def send_money(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Send money to user (Disbursement)"""
        pass
    
    @abstractmethod
    async def check_transaction_status(self, transaction_id: str) -> MobileMoneyResult:
        """Check status of a transaction"""
        pass
    
    @abstractmethod
    async def get_balance(self) -> Dict[str, Any]:
        """Get account balance"""
        pass


class MTNMoMoProvider(BaseMobileMoneyProvider):
    """MTN Mobile Money API Provider"""
    
    def __init__(self):
        self.environment = os.environ.get("MTN_MOMO_ENVIRONMENT", "sandbox")
        
        # Collection credentials
        self.collection_user_id = os.environ.get("MTN_MOMO_COLLECTION_USER_ID", "")
        self.collection_api_key = os.environ.get("MTN_MOMO_COLLECTION_API_KEY", "")
        self.collection_primary_key = os.environ.get("MTN_MOMO_COLLECTION_PRIMARY_KEY", "")
        
        # Disbursement credentials
        self.disbursement_user_id = os.environ.get("MTN_MOMO_DISBURSEMENT_USER_ID", "")
        self.disbursement_api_key = os.environ.get("MTN_MOMO_DISBURSEMENT_API_KEY", "")
        self.disbursement_primary_key = os.environ.get("MTN_MOMO_DISBURSEMENT_PRIMARY_KEY", "")
        
        self.base_url = "https://sandbox.momodeveloper.mtn.com" if self.environment == "sandbox" else "https://proxy.momoapi.mtn.com"
        self._access_tokens = {}
    
    async def _get_access_token(self, product: str = "collection") -> Optional[str]:
        """Get OAuth access token for MoMo API"""
        if product == "collection":
            user_id, api_key, primary_key = self.collection_user_id, self.collection_api_key, self.collection_primary_key
        else:
            user_id, api_key, primary_key = self.disbursement_user_id, self.disbursement_api_key, self.disbursement_primary_key
        
        if not all([user_id, api_key, primary_key]):
            return None
        
        try:
            credentials = base64.b64encode(f"{user_id}:{api_key}".encode()).decode()
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/{product}/token/",
                    headers={
                        "Authorization": f"Basic {credentials}",
                        "Ocp-Apim-Subscription-Key": primary_key
                    }
                )
                if response.status_code == 200:
                    return response.json().get("access_token")
        except Exception as e:
            logger.error(f"MTN MoMo token error: {e}")
        return None
    
    async def request_payment(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Request payment from user via MTN MoMo"""
        token = await self._get_access_token("collection")
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        external_id = str(uuid.uuid4())
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/collection/v1_0/requesttopay",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Reference-Id": external_id,
                        "X-Target-Environment": self.environment,
                        "Ocp-Apim-Subscription-Key": self.collection_primary_key,
                        "Content-Type": "application/json"
                    },
                    json={
                        "amount": str(int(amount)),
                        "currency": currency,
                        "externalId": reference,
                        "payer": {
                            "partyIdType": "MSISDN",
                            "partyId": phone.replace("+", "")
                        },
                        "payerMessage": description,
                        "payeeNote": description
                    }
                )
                
                if response.status_code == 202:
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=external_id,
                        external_id=reference,
                        provider="mtn_momo",
                        status=TransactionStatus.PENDING,
                        amount=amount,
                        currency=currency
                    )
                
                return MobileMoneyResult(
                    success=False,
                    error=f"MTN MoMo Error: {response.status_code} - {response.text}"
                )
                
        except Exception as e:
            logger.error(f"MTN MoMo payment request error: {e}")
            return MobileMoneyResult(success=False, error=str(e))
    
    async def send_money(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Send money to user via MTN MoMo"""
        token = await self._get_access_token("disbursement")
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        external_id = str(uuid.uuid4())
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/disbursement/v1_0/transfer",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Reference-Id": external_id,
                        "X-Target-Environment": self.environment,
                        "Ocp-Apim-Subscription-Key": self.disbursement_primary_key,
                        "Content-Type": "application/json"
                    },
                    json={
                        "amount": str(int(amount)),
                        "currency": currency,
                        "externalId": reference,
                        "payee": {
                            "partyIdType": "MSISDN",
                            "partyId": phone.replace("+", "")
                        },
                        "payerMessage": description,
                        "payeeNote": description
                    }
                )
                
                if response.status_code == 202:
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=external_id,
                        external_id=reference,
                        provider="mtn_momo",
                        status=TransactionStatus.PENDING,
                        amount=amount,
                        currency=currency
                    )
                
                return MobileMoneyResult(success=False, error=f"MTN MoMo Error: {response.text}")
                
        except Exception as e:
            logger.error(f"MTN MoMo disbursement error: {e}")
            return MobileMoneyResult(success=False, error=str(e))
    
    async def check_transaction_status(self, transaction_id: str, product: str = "collection") -> MobileMoneyResult:
        """Check transaction status"""
        token = await self._get_access_token(product)
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        primary_key = self.collection_primary_key if product == "collection" else self.disbursement_primary_key
        endpoint = "requesttopay" if product == "collection" else "transfer"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/{product}/v1_0/{endpoint}/{transaction_id}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Target-Environment": self.environment,
                        "Ocp-Apim-Subscription-Key": primary_key
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    status_map = {
                        "SUCCESSFUL": TransactionStatus.SUCCESSFUL,
                        "FAILED": TransactionStatus.FAILED,
                        "PENDING": TransactionStatus.PENDING
                    }
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=transaction_id,
                        provider="mtn_momo",
                        status=status_map.get(data.get("status"), TransactionStatus.PENDING),
                        amount=float(data.get("amount", 0)),
                        currency=data.get("currency")
                    )
                
                return MobileMoneyResult(success=False, error=response.text)
                
        except Exception as e:
            logger.error(f"MTN MoMo status check error: {e}")
            return MobileMoneyResult(success=False, error=str(e))
    
    async def get_balance(self) -> Dict[str, Any]:
        """Get collection account balance"""
        token = await self._get_access_token("collection")
        if not token:
            return {"error": "Failed to get access token"}
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/collection/v1_0/account/balance",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Target-Environment": self.environment,
                        "Ocp-Apim-Subscription-Key": self.collection_primary_key
                    }
                )
                return response.json() if response.status_code == 200 else {"error": response.text}
        except Exception as e:
            return {"error": str(e)}


class OrangeMoneyProvider(BaseMobileMoneyProvider):
    """Orange Money API Provider"""
    
    def __init__(self):
        self.client_id = os.environ.get("ORANGE_MONEY_CLIENT_ID", "")
        self.client_secret = os.environ.get("ORANGE_MONEY_CLIENT_SECRET", "")
        self.merchant_key = os.environ.get("ORANGE_MONEY_MERCHANT_KEY", "")
        self.environment = os.environ.get("ORANGE_MONEY_ENVIRONMENT", "sandbox")
        self.base_url = "https://api.orange.com/orange-money-webpay/dev/v1" if self.environment == "sandbox" else "https://api.orange.com/orange-money-webpay/v1"
        self._access_token = None
    
    async def _get_access_token(self) -> Optional[str]:
        """Get OAuth access token"""
        if not self.client_id or not self.client_secret:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.orange.com/oauth/v3/token",
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret
                    }
                )
                if response.status_code == 200:
                    return response.json().get("access_token")
        except Exception as e:
            logger.error(f"Orange Money token error: {e}")
        return None
    
    async def request_payment(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Request payment via Orange Money WebPay"""
        token = await self._get_access_token()
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        order_id = str(uuid.uuid4())[:12].upper()
        callback_url = os.environ.get("MOMO_CALLBACK_URL", "https://your-domain.com/api/webhooks/mobile-money/callback")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/webpayment",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "merchant_key": self.merchant_key,
                        "currency": currency,
                        "order_id": order_id,
                        "amount": int(amount),
                        "return_url": callback_url,
                        "cancel_url": callback_url,
                        "notif_url": callback_url,
                        "lang": "fr",
                        "reference": reference
                    }
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=data.get("pay_token", order_id),
                        external_id=order_id,
                        provider="orange_money",
                        status=TransactionStatus.PENDING,
                        amount=amount,
                        currency=currency
                    )
                
                return MobileMoneyResult(success=False, error=f"Orange Money Error: {response.text}")
                
        except Exception as e:
            logger.error(f"Orange Money payment error: {e}")
            return MobileMoneyResult(success=False, error=str(e))
    
    async def send_money(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Orange Money disbursement - Not supported via WebPay"""
        return MobileMoneyResult(
            success=False,
            error="Orange Money WebPay does not support direct disbursements. Use bank transfer API."
        )
    
    async def check_transaction_status(self, transaction_id: str) -> MobileMoneyResult:
        """Check transaction status"""
        token = await self._get_access_token()
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/webpayment/{transaction_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    status_map = {
                        "SUCCESS": TransactionStatus.SUCCESSFUL,
                        "FAILED": TransactionStatus.FAILED,
                        "PENDING": TransactionStatus.PENDING,
                        "INITIATED": TransactionStatus.PENDING
                    }
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=transaction_id,
                        provider="orange_money",
                        status=status_map.get(data.get("status"), TransactionStatus.PENDING)
                    )
                
                return MobileMoneyResult(success=False, error=response.text)
                
        except Exception as e:
            return MobileMoneyResult(success=False, error=str(e))
    
    async def get_balance(self) -> Dict[str, Any]:
        """Orange Money balance check - Limited API support"""
        return {"message": "Balance check not available via Orange Money WebPay API"}


class AirtelMoneyProvider(BaseMobileMoneyProvider):
    """Airtel Money API Provider"""
    
    def __init__(self):
        self.client_id = os.environ.get("AIRTEL_MONEY_CLIENT_ID", "")
        self.client_secret = os.environ.get("AIRTEL_MONEY_CLIENT_SECRET", "")
        self.environment = os.environ.get("AIRTEL_MONEY_ENVIRONMENT", "sandbox")
        self.base_url = "https://openapiuat.airtel.africa" if self.environment == "sandbox" else "https://openapi.airtel.africa"
        self._access_token = None
    
    async def _get_access_token(self) -> Optional[str]:
        """Get OAuth access token"""
        if not self.client_id or not self.client_secret:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/auth/oauth2/token",
                    headers={"Content-Type": "application/json"},
                    json={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "grant_type": "client_credentials"
                    }
                )
                if response.status_code == 200:
                    return response.json().get("access_token")
        except Exception as e:
            logger.error(f"Airtel Money token error: {e}")
        return None
    
    async def request_payment(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Request payment via Airtel Money"""
        token = await self._get_access_token()
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        transaction_id = str(uuid.uuid4())
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/merchant/v1/payments/",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "X-Country": "UG",  # Country code
                        "X-Currency": currency
                    },
                    json={
                        "reference": reference,
                        "subscriber": {
                            "country": "UG",
                            "currency": currency,
                            "msisdn": phone.replace("+", "")
                        },
                        "transaction": {
                            "amount": amount,
                            "country": "UG",
                            "currency": currency,
                            "id": transaction_id
                        }
                    }
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=data.get("data", {}).get("transaction", {}).get("id", transaction_id),
                        external_id=reference,
                        provider="airtel_money",
                        status=TransactionStatus.PENDING,
                        amount=amount,
                        currency=currency
                    )
                
                return MobileMoneyResult(success=False, error=f"Airtel Money Error: {response.text}")
                
        except Exception as e:
            logger.error(f"Airtel Money payment error: {e}")
            return MobileMoneyResult(success=False, error=str(e))
    
    async def send_money(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str
    ) -> MobileMoneyResult:
        """Send money via Airtel Money"""
        token = await self._get_access_token()
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        transaction_id = str(uuid.uuid4())
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/standard/v1/disbursements/",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "X-Country": "UG",
                        "X-Currency": currency
                    },
                    json={
                        "payee": {
                            "msisdn": phone.replace("+", "")
                        },
                        "reference": reference,
                        "pin": os.environ.get("AIRTEL_MONEY_PIN", ""),
                        "transaction": {
                            "amount": amount,
                            "id": transaction_id
                        }
                    }
                )
                
                if response.status_code in [200, 201]:
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=transaction_id,
                        external_id=reference,
                        provider="airtel_money",
                        status=TransactionStatus.PENDING,
                        amount=amount,
                        currency=currency
                    )
                
                return MobileMoneyResult(success=False, error=f"Airtel Money Error: {response.text}")
                
        except Exception as e:
            return MobileMoneyResult(success=False, error=str(e))
    
    async def check_transaction_status(self, transaction_id: str) -> MobileMoneyResult:
        """Check transaction status"""
        token = await self._get_access_token()
        if not token:
            return MobileMoneyResult(success=False, error="Failed to get access token")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/standard/v1/payments/{transaction_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    status = data.get("data", {}).get("transaction", {}).get("status")
                    status_map = {
                        "TS": TransactionStatus.SUCCESSFUL,
                        "TF": TransactionStatus.FAILED,
                        "TIP": TransactionStatus.PENDING
                    }
                    return MobileMoneyResult(
                        success=True,
                        transaction_id=transaction_id,
                        provider="airtel_money",
                        status=status_map.get(status, TransactionStatus.PENDING)
                    )
                
                return MobileMoneyResult(success=False, error=response.text)
                
        except Exception as e:
            return MobileMoneyResult(success=False, error=str(e))
    
    async def get_balance(self) -> Dict[str, Any]:
        """Get account balance"""
        return {"message": "Use Airtel Money portal for balance check"}


# ===========================================
# INTEGRATION SERVICE (MAIN CLASS)
# ===========================================

class IntegrationService:
    """
    Main integration service that manages all external API providers.
    Automatically selects the best provider based on country and availability.
    """
    
    def __init__(self):
        # SMS Providers
        self._sms_providers = {
            SMSProvider.AFRICAS_TALKING: AfricasTalkingSMS(),
            SMSProvider.TWILIO: TwilioSMS()
        }
        
        # Mobile Money Providers
        self._momo_providers = {
            MobileMoneyProvider.MTN_MOMO: MTNMoMoProvider(),
            MobileMoneyProvider.ORANGE_MONEY: OrangeMoneyProvider(),
            MobileMoneyProvider.AIRTEL_MONEY: AirtelMoneyProvider()
        }
        
        # Default preferences
        self.default_sms_provider = SMSProvider(os.environ.get("SMS_PROVIDER", "africas_talking"))
        self.default_momo_provider = MobileMoneyProvider(os.environ.get("DEFAULT_MOBILE_MONEY_PROVIDER", "mtn_momo"))
    
    def get_sms_provider(self, provider: Optional[SMSProvider] = None) -> BaseSMSProvider:
        """Get SMS provider instance"""
        return self._sms_providers.get(provider or self.default_sms_provider)
    
    def get_momo_provider(self, provider: Optional[MobileMoneyProvider] = None) -> BaseMobileMoneyProvider:
        """Get Mobile Money provider instance"""
        return self._momo_providers.get(provider or self.default_momo_provider)
    
    async def send_otp(self, phone: str, otp_code: str, country_code: str = "CD") -> SMSResult:
        """Send OTP SMS with automatic provider selection"""
        config = get_country_config(country_code)
        if not config:
            return SMSResult(success=False, error=f"Country {country_code} not supported")
        
        message = f"Monity World: Votre code de vérification est {otp_code}. Valide 10 minutes."
        
        # Try providers in order of preference
        for provider_enum in config.sms_providers:
            provider = self._sms_providers.get(provider_enum)
            if provider:
                result = await provider.send_sms(phone, message)
                if result.success:
                    logger.info(f"OTP sent via {provider_enum.value} to {phone}")
                    return result
                logger.warning(f"SMS failed via {provider_enum.value}: {result.error}")
        
        return SMSResult(success=False, error="All SMS providers failed")
    
    async def request_mobile_money_payment(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str, country_code: str = "CD",
        preferred_provider: Optional[MobileMoneyProvider] = None
    ) -> MobileMoneyResult:
        """Request mobile money payment with automatic provider selection"""
        config = get_country_config(country_code)
        if not config:
            return MobileMoneyResult(success=False, error=f"Country {country_code} not supported")
        
        # Use preferred provider if specified and available
        providers_to_try = []
        if preferred_provider and preferred_provider in config.mobile_money_providers:
            providers_to_try.append(preferred_provider)
        providers_to_try.extend([p for p in config.mobile_money_providers if p not in providers_to_try])
        
        for provider_enum in providers_to_try:
            provider = self._momo_providers.get(provider_enum)
            if provider:
                result = await provider.request_payment(phone, amount, currency, reference, description)
                if result.success:
                    logger.info(f"Payment request sent via {provider_enum.value} to {phone}")
                    return result
                logger.warning(f"Payment failed via {provider_enum.value}: {result.error}")
        
        return MobileMoneyResult(success=False, error="All mobile money providers failed")
    
    async def send_mobile_money(
        self, phone: str, amount: float, currency: str,
        reference: str, description: str, country_code: str = "CD",
        preferred_provider: Optional[MobileMoneyProvider] = None
    ) -> MobileMoneyResult:
        """Send money via mobile money"""
        config = get_country_config(country_code)
        if not config:
            return MobileMoneyResult(success=False, error=f"Country {country_code} not supported")
        
        providers_to_try = []
        if preferred_provider and preferred_provider in config.mobile_money_providers:
            providers_to_try.append(preferred_provider)
        providers_to_try.extend([p for p in config.mobile_money_providers if p not in providers_to_try])
        
        for provider_enum in providers_to_try:
            provider = self._momo_providers.get(provider_enum)
            if provider:
                result = await provider.send_money(phone, amount, currency, reference, description)
                if result.success:
                    logger.info(f"Disbursement sent via {provider_enum.value} to {phone}")
                    return result
                logger.warning(f"Disbursement failed via {provider_enum.value}: {result.error}")
        
        return MobileMoneyResult(success=False, error="All mobile money providers failed")
    
    def get_supported_countries(self) -> List[Dict[str, Any]]:
        """Get list of supported countries with their providers"""
        return [
            {
                "code": code,
                "name": config.name,
                "dial_code": config.dial_code,
                "currency": config.currency,
                "sms_providers": [p.value for p in config.sms_providers],
                "mobile_money_providers": [p.value for p in config.mobile_money_providers]
            }
            for code, config in COUNTRY_INTEGRATIONS.items()
        ]


# Global instance
integration_service = IntegrationService()
