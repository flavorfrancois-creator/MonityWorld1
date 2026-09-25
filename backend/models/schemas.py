"""
Monity World - All Pydantic Models
Comprehensive models extracted from server.py
"""
from pydantic import BaseModel
from typing import Optional, List


class RegisterReq(BaseModel):
    phone: str
    name: str
    email: Optional[str] = None
    password: str
    country: str = "CD"
    language: str = "fr"
    referral_code: Optional[str] = None
    nfc_card_number: Optional[str] = None  # 16-digit printed card number (e.g., 8552-9657-5431-4523)


class LoginReq(BaseModel):
    phone: Optional[str] = None  # Can login with phone OR email
    email: Optional[str] = None
    password: str


class OTPReq(BaseModel):
    phone: str
    otp: str


class PasswordChangeReq(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequestReq(BaseModel):
    identifier: str  # phone or email
    method: str = "phone"  # "phone" or "email"


class PasswordResetConfirmReq(BaseModel):
    token: str
    new_password: str


class ProfileUpdateReq(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = None


class TransferReq(BaseModel):
    receiver_phone: Optional[str] = None
    receiver_account: Optional[str] = None
    amount: float
    currency: str = "USD"  # Source currency (from sender's wallet)
    target_currency: Optional[str] = None  # Destination currency (if different from source)
    description: Optional[str] = None


class CardReq(BaseModel):
    card_type: str = "virtual"
    limit: float = 1000.0


class SavingsReq(BaseModel):
    type: str = "flexible"
    amount: float
    currency: str = "USD"
    duration_months: Optional[int] = None


class GroupReq(BaseModel):
    name: str
    contribution_amount: float
    currency: str = "USD"
    frequency: str = "monthly"  # daily, weekly, biweekly, monthly, quarterly
    max_members: int = 10
    auto_debit: bool = False  # Prélèvement automatique
    description: Optional[str] = None


class GroupInviteReq(BaseModel):
    phone_numbers: List[str]  # List of phone numbers to invite


class GroupJoinRequestReq(BaseModel):
    invite_code: str


class InvitationResponseReq(BaseModel):
    action: str  # accept, reject


class SavingsReqV2(BaseModel):
    name: str
    type: str = "flexible"  # flexible, fixed
    target_amount: float
    currency: str = "USD"
    frequency: str = "monthly"  # daily, weekly, biweekly, monthly, quarterly
    contribution_amount: float
    auto_debit: bool = False
    duration_months: Optional[int] = None


class RotationOrderReq(BaseModel):
    member_order: List[str]  # List of user IDs in order


class PayoutReq(BaseModel):
    beneficiary_id: str
    amount: Optional[float] = None  # If None, use full pot
    note: Optional[str] = None


class CurrencyUpdateReq(BaseModel):
    rate_to_usd: float
    is_active: bool = True


class TransactionRuleReq(BaseModel):
    """Rules for transaction fees and limits by country and type"""
    country_code: str  # Country code (e.g., "CD", "CM", "ALL" for global)
    transaction_type: str  # transfer, withdrawal, recharge, international
    fee_type: str = "percentage"  # percentage or fixed
    fee_value: float = 0.0  # Fee amount (% or fixed)
    min_fee: float = 0.0  # Minimum fee
    max_fee: Optional[float] = None  # Maximum fee (optional cap)
    daily_limit: float = 10000.0  # Daily transaction limit
    monthly_limit: float = 100000.0  # Monthly transaction limit
    per_transaction_min: float = 1.0  # Minimum per transaction
    per_transaction_max: float = 5000.0  # Maximum per transaction
    is_active: bool = True


class InternationalRuleReq(BaseModel):
    """Rules for international transactions between countries"""
    source_country: str  # Origin country code
    destination_country: str  # Destination country code
    fee_type: str = "percentage"  # percentage or fixed
    fee_value: float = 2.5  # Fee amount (higher for international)
    min_fee: float = 1.0
    max_fee: Optional[float] = None
    exchange_rate_margin: float = 2.0  # % margin on exchange rate
    daily_limit: float = 5000.0
    monthly_limit: float = 50000.0
    per_transaction_min: float = 10.0
    per_transaction_max: float = 2000.0
    is_active: bool = True
    processing_time: str = "instant"  # instant, 1-3 days, etc.


class ProfileReq(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = None
    country: Optional[str] = None


class TxActionReq(BaseModel):
    action: str
    note: Optional[str] = None


class UserUpdateReq(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class KYCPersonalInfoReq(BaseModel):
    last_name: str  # Nom
    first_name: str  # Prénom
    date_of_birth: str  # Date de naissance (YYYY-MM-DD)
    place_of_birth: str  # Lieu de naissance
    occupation: Optional[str] = None  # Emploi
    residence_address: str  # Adresse de résidence
    postal_box: Optional[str] = None  # Boîte postale
    postal_code: Optional[str] = None  # Code postal
    street: Optional[str] = None  # Rue
    city: Optional[str] = None  # Ville
    country: Optional[str] = None  # Pays de résidence


class RechargeReq(BaseModel):
    amount: float
    currency: str = "USD"
    method: str = "mobile_money"


class WithdrawReq(BaseModel):
    amount: float
    currency: str = "USD"
    method: str = "mobile_money"
    destination: str


class WalletAddReq(BaseModel):
    currency: str


class WalletConvertAndReplaceReq(BaseModel):
    """Request to create a new wallet by converting an existing one"""
    source_currency: str  # Currency to convert FROM (will be deleted)
    target_currency: str  # New currency to create
    conversion_fee_percent: float = 1.5  # Conversion fee (default 1.5%)


class WalletDeleteReq(BaseModel):
    """Request to delete a wallet with optional conversion"""
    currency: str  # Currency to delete
    convert_to: str = None  # If set, convert balance to this currency before deleting


class CountryReq(BaseModel):
    code: str
    name: str
    dial_code: str
    currency_code: str
    flag: str = ""
    is_active: bool = True


class VirtualCardReq(BaseModel):
    name: str
    currency: str = "USD"
    limit: float = 1000.0
    can_send: bool = True
    can_receive: bool = True
    auto_recharge: bool = False
    auto_recharge_amount: Optional[float] = None
    auto_recharge_frequency: Optional[str] = None  # daily, weekly, monthly, quarterly


class VirtualCardUpdateReq(BaseModel):
    name: Optional[str] = None
    is_locked: Optional[bool] = None
    can_send: Optional[bool] = None
    can_receive: Optional[bool] = None
    auto_recharge: Optional[bool] = None
    auto_recharge_amount: Optional[float] = None
    auto_recharge_frequency: Optional[str] = None


class AdminCreateReq(BaseModel):
    phone: str
    name: str
    password: str
    assigned_countries: List[str] = []
    assigned_transaction_types: List[str] = []


class AdminZoneUpdateReq(BaseModel):
    assigned_countries: Optional[List[str]] = None
    assigned_transaction_types: Optional[List[str]] = None


class CardDeleteVoteReq(BaseModel):
    card_id: str
    vote: str  # approve or reject


class NFCAssociationReq(BaseModel):
    nfc_serial_number: str  # Format: 05:G8:5F:54:22:75:Y5


class StandaloneCardReq(BaseModel):
    name: str
    currency: str = "USD"
    initial_balance: float = 0.0
    limit: float = 1000.0
    nfc_serial_number: Optional[str] = None  # Can be added later


class ManagerRechargeReq(BaseModel):
    user_phone: str
    amount: float
    currency: str = "USD"
    method: str = "cash"
    note: Optional[str] = None


class PaymentLinkReq(BaseModel):
    amount: float
    currency: str = "USD"
    description: str
    password: str
    expires_hours: int = 24


class PaymentLinkPayReq(BaseModel):
    password: str


class EcommerceLinkCreateReq(BaseModel):
    """Create an e-commerce payment link for receiving or sending money"""
    link_type: str  # "receive" or "send"
    is_permanent: bool = False  # True = permanent (no expiry), False = temporary
    fixed_amount: Optional[float] = None  # Only for temporary links
    currency: str = "USD"
    description: str
    # For security, validation code is sent to the payer's account


class EcommerceLinkPayReq(BaseModel):
    """Pay via an e-commerce link"""
    sender_phone: str  # Phone number of the person making the payment
    amount: Optional[float] = None  # Required for permanent links (no fixed amount)
    validation_code: str  # OTP code sent to sender's Monity account


class EcommerceLinkSendReq(BaseModel):
    """Send money via an e-commerce link"""
    receiver_phone: str  # Phone number of the beneficiary
    amount: Optional[float] = None  # Required for permanent links
    validation_code: str  # OTP code sent to user's Monity account


class ApiKeyCreateReq(BaseModel):
    """Create API key for e-commerce integration"""
    name: str  # Name for this API key (e.g., "My Online Store")
    website_url: Optional[str] = None
    allowed_ips: List[str] = []  # Whitelist IPs (empty = all allowed)
    permissions: List[str] = ["payments.receive", "payments.status"]  # API permissions
    daily_limit: Optional[float] = None  # Daily transaction limit
    webhook_url: Optional[str] = None  # URL to receive payment notifications


class ApiKeyUpdateReq(BaseModel):
    """Update API key settings"""
    name: Optional[str] = None
    website_url: Optional[str] = None
    allowed_ips: Optional[List[str]] = None
    permissions: Optional[List[str]] = None
    daily_limit: Optional[float] = None
    webhook_url: Optional[str] = None
    is_active: Optional[bool] = None


class GroupMessageReq(BaseModel):
    group_id: str
    content: str


class ManagedAccountReq(BaseModel):
    managed_user_phone: str
    permissions: List[str] = ["view_balance", "view_transactions"]


class ManagedAccountActionReq(BaseModel):
    action: str
    permission: Optional[str] = None


class NFCCardCreateReq(BaseModel):
    """Create NFC card with validity dates"""
    name: str
    currency: str = "USD"
    initial_balance: float = 0.0
    limit: float = 1000.0
    nfc_serial_number: Optional[str] = None
    card_pin: str  # 4-digit PIN
    nfc_card_type: str = "basic"  # basic, standard, premium


class NFCSubscriptionRenewReq(BaseModel):
    """Renew NFC card subscription"""
    card_id: str
    duration_months: int = 12  # Usually 1 year


class NFCSubscriptionFeeReq(BaseModel):
    """Set subscription fee for NFC cards"""
    country_code: str
    card_type: str  # basic, standard, premium
    annual_fee: float
    currency: str = "USD"
    is_active: bool = True


class BankCardAddReq(BaseModel):
    """Add external bank card"""
    card_type: str  # visa, mastercard
    card_number: str  # Full number (will be masked)
    holder_name: str
    expiry_month: int
    expiry_year: int
    billing_address: Optional[str] = None


class BankCardAdminActionReq(BaseModel):
    """Admin action on bank card"""
    action: str  # approve, reject, enable_withdrawal, disable_withdrawal
    note: Optional[str] = None


class MobilePaymentOperatorReq(BaseModel):
    """Configure mobile payment operator"""
    country_code: str
    operator_name: str  # Orange Money, MTN MoMo, Airtel Money, etc.
    operator_code: str  # ORANGE_CD, MTN_CM, etc.
    api_base_url: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    webhook_url: Optional[str] = None
    deposit_endpoint: Optional[str] = None
    withdrawal_endpoint: Optional[str] = None
    balance_endpoint: Optional[str] = None
    is_active: bool = True
    min_amount: float = 1.0
    max_amount: float = 10000.0
    fee_percentage: float = 1.5
    fee_fixed: float = 0.0


class MobilePaymentDepositReq(BaseModel):
    """Deposit via mobile money"""
    operator_code: str
    phone_number: str
    amount: float
    currency: str = "USD"


class MobilePaymentWithdrawReq(BaseModel):
    """Withdraw to mobile money"""
    operator_code: str
    phone_number: str
    amount: float
    currency: str = "USD"


class FinancialIntegrationReq(BaseModel):
    """Configuration for financial API integration"""
    integration_type: str  # Key from INTEGRATION_TYPES
    integration_code: str  # Unique code for this integration instance
    display_name: str  # Custom display name
    category: str  # banking, mobile_money, crypto, ewallet, other
    
    # API Configuration
    api_base_url: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    api_token: Optional[str] = None
    merchant_id: Optional[str] = None
    account_id: Optional[str] = None
    
    # Endpoints
    deposit_endpoint: Optional[str] = None
    withdrawal_endpoint: Optional[str] = None
    balance_endpoint: Optional[str] = None
    status_endpoint: Optional[str] = None
    webhook_endpoint: Optional[str] = None
    
    # Webhook configuration
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    
    # Supported operations
    supports_deposit: bool = True
    supports_withdrawal: bool = True
    supports_balance_check: bool = False
    
    # Countries & Currencies
    supported_countries: List[str] = []  # Empty = all countries
    supported_currencies: List[str] = ["USD"]
    default_currency: str = "USD"
    
    # Fees configuration
    deposit_fee_type: str = "percentage"  # percentage, fixed, both
    deposit_fee_percentage: float = 0.0
    deposit_fee_fixed: float = 0.0
    withdrawal_fee_type: str = "percentage"
    withdrawal_fee_percentage: float = 0.0
    withdrawal_fee_fixed: float = 0.0
    
    # Limits
    min_deposit: float = 1.0
    max_deposit: float = 10000.0
    min_withdrawal: float = 1.0
    max_withdrawal: float = 10000.0
    daily_limit: Optional[float] = None
    monthly_limit: Optional[float] = None
    
    # Status
    is_active: bool = True
    is_test_mode: bool = True  # Sandbox/test mode
    priority: int = 1  # Lower = higher priority
    
    # Additional settings (JSON)
    extra_config: Optional[dict] = None


class FinancialIntegrationUpdateReq(BaseModel):
    """Update financial integration"""
    display_name: Optional[str] = None
    api_base_url: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    api_token: Optional[str] = None
    merchant_id: Optional[str] = None
    account_id: Optional[str] = None
    deposit_endpoint: Optional[str] = None
    withdrawal_endpoint: Optional[str] = None
    balance_endpoint: Optional[str] = None
    status_endpoint: Optional[str] = None
    webhook_endpoint: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    supports_deposit: Optional[bool] = None
    supports_withdrawal: Optional[bool] = None
    supports_balance_check: Optional[bool] = None
    supported_countries: Optional[List[str]] = None
    supported_currencies: Optional[List[str]] = None
    default_currency: Optional[str] = None
    deposit_fee_type: Optional[str] = None
    deposit_fee_percentage: Optional[float] = None
    deposit_fee_fixed: Optional[float] = None
    withdrawal_fee_type: Optional[str] = None
    withdrawal_fee_percentage: Optional[float] = None
    withdrawal_fee_fixed: Optional[float] = None
    min_deposit: Optional[float] = None
    max_deposit: Optional[float] = None
    min_withdrawal: Optional[float] = None
    max_withdrawal: Optional[float] = None
    daily_limit: Optional[float] = None
    monthly_limit: Optional[float] = None
    is_active: Optional[bool] = None
    is_test_mode: Optional[bool] = None
    priority: Optional[int] = None
    extra_config: Optional[dict] = None


class IntegrationTestReq(BaseModel):
    """Test integration connection"""
    integration_code: str
    test_type: str = "connection"  # connection, deposit, withdrawal, balance


class IntegrationTransactionReq(BaseModel):
    """Execute transaction via integration"""
    integration_code: str
    transaction_type: str  # deposit, withdrawal
    amount: float
    currency: str = "USD"
    recipient_info: Optional[dict] = None  # Phone, account number, wallet address, etc.
    reference: Optional[str] = None
    metadata: Optional[dict] = None


class SmsApiConfigReq(BaseModel):
    """Configuration for SMS API provider"""
    provider_name: str  # Twilio, Nexmo, Infobip, Orange SMS API, etc.
    provider_code: str  # TWILIO, NEXMO, INFOBIP, ORANGE_SMS
    service_type: str = "external"  # "internal" (WhatsApp) or "external" (API SMS)
    api_base_url: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    sender_id: Optional[str] = None  # Sender name/number
    auth_token: Optional[str] = None
    account_sid: Optional[str] = None  # For Twilio
    countries: List[str] = []  # Country codes this provider handles
    is_active: bool = True
    is_default: bool = False
    priority: int = 1  # Lower number = higher priority
    cost_per_sms: float = 0.0
    currency: str = "USD"


class SmsTestReq(BaseModel):
    """Test SMS send request"""
    provider_code: str
    phone_number: str
    message: str


class SmtpConfigReq(BaseModel):
    """Configuration for an SMTP server used to send password-reset links and OTP emails"""
    provider_name: str  # Display name, e.g. "Gmail principal", "SendGrid RDC"
    provider_code: str  # Unique code, e.g. GMAIL_MAIN, SENDGRID_CD
    host: str
    port: int = 587
    username: str
    password: Optional[str] = None  # Left blank on edit to keep the existing stored password
    from_email: str
    from_name: str = "Monity World"
    use_tls: bool = True
    countries: List[str] = []  # Country codes this connection serves; empty = all states
    is_all_states: bool = False  # Explicit "for all states" fallback connection
    is_active: bool = True
    is_default: bool = False
    priority: int = 1  # Lower number = higher priority when multiple configs match


class SmtpTestReq(BaseModel):
    """Test SMTP send request"""
    provider_code: str
    to_email: str
    message: Optional[str] = None


class AdminActivityLogReq(BaseModel):
    """Request model for filtering activity logs"""
    admin_id: Optional[str] = None
    action_type: Optional[str] = None  # create, read, update, delete, login, logout
    resource_type: Optional[str] = None  # user, transaction, kyc, admin, settings, etc.
    date_from: Optional[str] = None  # ISO date
    date_to: Optional[str] = None
    page: int = 1
    limit: int = 50


class ActivityRetentionReq(BaseModel):
    """Request model for setting retention period"""
    retention_days: int  # 30, 90, 365, 1825 (5 years)


class BiometricSettingsReq(BaseModel):
    enabled: bool
    require_for_roles: Optional[List[str]] = None  # ['admin', 'merchant']


class BiometricRegistrationReq(BaseModel):
    id: str
    rawId: str
    response: dict
    type: str
    name: Optional[str] = "Mon appareil"


class BiometricAuthenticationReq(BaseModel):
    user_id: str
    id: str
    rawId: str
    response: dict
    type: str


class CountryServicesUpdateReq(BaseModel):
    """Update services configuration for a country"""
    # National services
    send_national: Optional[bool] = None
    receive_national: Optional[bool] = None
    deposit: Optional[bool] = None
    withdrawal: Optional[bool] = None
    savings: Optional[bool] = None
    contribution: Optional[bool] = None  # Cotisation/Tontine
    currency_conversion: Optional[bool] = None
    
    # International services
    send_international: Optional[bool] = None
    receive_international: Optional[bool] = None
    withdrawal_international: Optional[bool] = None
    contribution_international: Optional[bool] = None
    
    # Cards
    virtual_cards: Optional[bool] = None


class PartnerCreateReq(BaseModel):
    """Request to create a partner account - by manager"""
    name: str
    phone: str
    email: Optional[str] = None
    business_name: str
    business_address: str
    country: str = "CD"
    commission_rate: float = 2.0  # Commission percentage on transactions
    notes: Optional[str] = None


class PartnerTopupReq(BaseModel):
    """Request to topup partner account - by manager"""
    partner_id: str
    amount: float
    currency: str = "USD"
    payment_method: str = "cash"  # cash, bank_transfer
    reference: Optional[str] = None


class PartnerClientRechargeReq(BaseModel):
    """Partner recharges a client's account"""
    client_phone: Optional[str] = None
    client_account: Optional[str] = None
    amount: float
    currency: str = "USD"


class PartnerClientWithdrawReq(BaseModel):
    """Partner processes a client withdrawal"""
    client_phone: Optional[str] = None
    client_account: Optional[str] = None
    amount: float
    currency: str = "USD"


class PartnerNFCRechargeReq(BaseModel):
    """Partner recharges a standalone NFC card"""
    nfc_serial: Optional[str] = None  # NFC serial like 05:G8:5F:54:22:75:Y5
    card_number: Optional[str] = None  # 16-digit printed number
    amount: float
    currency: str = "USD"


class PartnerNFCWithdrawReq(BaseModel):
    """Partner withdraws from a standalone NFC card"""
    nfc_serial: Optional[str] = None
    card_number: Optional[str] = None
    amount: float
    currency: str = "USD"


class PartnerRatesReq(BaseModel):
    """Set partner rates for a country by transaction type"""
    # Rates for client recharge
    client_recharge_partner_commission: float = 2.0
    client_recharge_client_fee: float = 1.0
    # Rates for client withdrawal
    client_withdraw_partner_commission: float = 2.0
    client_withdraw_client_fee: float = 1.5
    # Rates for NFC recharge
    nfc_recharge_partner_commission: float = 1.5
    nfc_recharge_client_fee: float = 0.5
    # Rates for NFC withdrawal
    nfc_withdraw_partner_commission: float = 1.5
    nfc_withdraw_client_fee: float = 0.5


class NFCCardLimitsReq(BaseModel):
    """Set NFC card limits for a country/currency"""
    card_type: str  # basic, standard, premium
    currency: str = "USD"
    daily_limit: float
    weekly_limit: float
    monthly_limit: float
    max_balance: float
    min_recharge: float = 1.0
    max_recharge: float


class AdminCreateReqV2(BaseModel):
    phone: str
    name: str
    email: Optional[str] = None
    password: str
    role: str = "admin"  # admin, manager, secondary_primary_admin
    country: str = "CD"
    assigned_countries: List[str] = []
    permissions: List[str] = []
    can_create_roles: List[str] = []
    can_suspend_roles: List[str] = []
    verification_token: Optional[str] = None
    date_of_birth: Optional[str] = None
    place_of_birth: Optional[str] = None


class AdminRegistrationStartReq(BaseModel):
    country: str
    phone: str
    email: str


class AdminRegistrationVerifyReq(BaseModel):
    verification_id: str
    phone_otp: str
    email_otp: str


class AdminRegistrationCompleteReq(BaseModel):
    verification_token: str
    name: str
    date_of_birth: str
    place_of_birth: str
    password: str
    role: str = "admin"
    assigned_countries: List[str] = []
    permissions: List[str] = []
    can_create_roles: List[str] = []
    can_suspend_roles: List[str] = []


class AdminPermissionsUpdateReq(BaseModel):
    permissions: List[str] = []
    assigned_countries: List[str] = []
    can_create_roles: List[str] = []
    can_suspend_roles: List[str] = []


class AdminSuspendReq(BaseModel):
    reason: Optional[str] = None


class UserSuspendReq(BaseModel):
    reason: Optional[str] = None


class CountryCurrenciesReq(BaseModel):
    currencies: List[str]  # List of currency codes like ["USD", "EUR", "XAF"]


class AccountingExportReq(BaseModel):
    """Request model for accounting export"""
    report_type: str = "complete"  # transactions, wallets, complete
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    format: str = "json"  # json, excel, csv, pdf
    country: Optional[str] = None
    currency: Optional[str] = None


class WhatsAppConfigReq(BaseModel):
    """Configuration WhatsApp par pays"""
    session_id: str  # Unique identifier for this WhatsApp session
    name: str  # Friendly name (e.g., "WhatsApp RDC")
    countries: List[str]  # List of country codes (e.g., ["CD", "CG"]) or ["*"] for all
    is_default: bool = False  # If true, used when no specific config matches
    is_active: bool = True
    config_type: str = "otp"  # "otp" pour OTP/notifications, "support" pour service client uniquement


class WhatsAppOTPTemplateReq(BaseModel):
    """Template personnalisé pour les messages OTP"""
    template_name: str  # Ex: "verification", "transaction", "login"
    message_template: str  # Message avec placeholder {code} pour le code OTP
    validity_minutes: int = 10
    is_active: bool = True


class WhatsAppSendReq(BaseModel):
    """Request to send a WhatsApp message"""
    phone: str
    message: str
    country_code: Optional[str] = None  # If not provided, will try to detect from phone


class WhatsAppConfigureReq(BaseModel):
    """Request for configuring WhatsApp connection"""
    method: str = "cloud_api"  # "cloud_api" or "phone_link"
    phoneNumberId: Optional[str] = None
    accessToken: Optional[str] = None
    businessAccountId: Optional[str] = None


class WhatsAppPairingCodeReq(BaseModel):
    """Request for pairing code"""
    countryCode: str  # e.g., "+243"
    phoneNumber: str  # e.g., "999000000"


class WhatsAppValidateReq(BaseModel):
    phone: str


class WhatsAppValidateConfirmReq(BaseModel):
    code: str


class WhatsAppCloudApiTestReq(BaseModel):
    """Test WhatsApp Cloud API"""
    phone_number: str
    message: str = "Test message depuis Monity World"


class GroupJoinBodyReq(BaseModel):
    invite_code: str

