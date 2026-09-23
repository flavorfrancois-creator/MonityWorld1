#!/usr/bin/env python3
"""Script to add all African and European currencies and service configuration"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client['monity_world']

def gen_id():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now(timezone.utc).isoformat()

# All African currencies
AFRICAN_CURRENCIES = [
    {"code": "DZD", "name": "Dinar algérien", "symbol": "د.ج", "rate_to_usd": 135.0},
    {"code": "AOA", "name": "Kwanza angolais", "symbol": "Kz", "rate_to_usd": 825.0},
    {"code": "XOF", "name": "Franc CFA (BCEAO)", "symbol": "FCFA", "rate_to_usd": 600.0},
    {"code": "XAF", "name": "Franc CFA (BEAC)", "symbol": "FCFA", "rate_to_usd": 600.0},
    {"code": "BWP", "name": "Pula botswanais", "symbol": "P", "rate_to_usd": 13.5},
    {"code": "BIF", "name": "Franc burundais", "symbol": "FBu", "rate_to_usd": 2850.0},
    {"code": "CVE", "name": "Escudo cap-verdien", "symbol": "Esc", "rate_to_usd": 100.0},
    {"code": "KMF", "name": "Franc comorien", "symbol": "CF", "rate_to_usd": 450.0},
    {"code": "CDF", "name": "Franc congolais", "symbol": "FC", "rate_to_usd": 2500.0},
    {"code": "DJF", "name": "Franc djiboutien", "symbol": "Fdj", "rate_to_usd": 177.0},
    {"code": "EGP", "name": "Livre égyptienne", "symbol": "E£", "rate_to_usd": 31.0},
    {"code": "ERN", "name": "Nakfa érythréen", "symbol": "Nfk", "rate_to_usd": 15.0},
    {"code": "SZL", "name": "Lilangeni swazi", "symbol": "L", "rate_to_usd": 18.5},
    {"code": "ETB", "name": "Birr éthiopien", "symbol": "Br", "rate_to_usd": 56.0},
    {"code": "GMD", "name": "Dalasi gambien", "symbol": "D", "rate_to_usd": 67.0},
    {"code": "GHS", "name": "Cedi ghanéen", "symbol": "₵", "rate_to_usd": 12.5},
    {"code": "GNF", "name": "Franc guinéen", "symbol": "FG", "rate_to_usd": 8600.0},
    {"code": "KES", "name": "Shilling kényan", "symbol": "KSh", "rate_to_usd": 155.0},
    {"code": "LSL", "name": "Loti lesothan", "symbol": "L", "rate_to_usd": 18.5},
    {"code": "LRD", "name": "Dollar libérien", "symbol": "L$", "rate_to_usd": 192.0},
    {"code": "LYD", "name": "Dinar libyen", "symbol": "ل.د", "rate_to_usd": 4.8},
    {"code": "MGA", "name": "Ariary malgache", "symbol": "Ar", "rate_to_usd": 4500.0},
    {"code": "MWK", "name": "Kwacha malawien", "symbol": "MK", "rate_to_usd": 1680.0},
    {"code": "MRU", "name": "Ouguiya mauritanien", "symbol": "UM", "rate_to_usd": 40.0},
    {"code": "MUR", "name": "Roupie mauricienne", "symbol": "₨", "rate_to_usd": 45.0},
    {"code": "MAD", "name": "Dirham marocain", "symbol": "د.م.", "rate_to_usd": 10.0},
    {"code": "MZN", "name": "Metical mozambicain", "symbol": "MT", "rate_to_usd": 63.5},
    {"code": "NAD", "name": "Dollar namibien", "symbol": "N$", "rate_to_usd": 18.5},
    {"code": "NGN", "name": "Naira nigérian", "symbol": "₦", "rate_to_usd": 1550.0},
    {"code": "RWF", "name": "Franc rwandais", "symbol": "FRw", "rate_to_usd": 1250.0},
    {"code": "STN", "name": "Dobra santoméen", "symbol": "Db", "rate_to_usd": 22.5},
    {"code": "SCR", "name": "Roupie seychelloise", "symbol": "₨", "rate_to_usd": 13.5},
    {"code": "SLL", "name": "Leone sierra-léonais", "symbol": "Le", "rate_to_usd": 22500.0},
    {"code": "SOS", "name": "Shilling somalien", "symbol": "S", "rate_to_usd": 571.0},
    {"code": "ZAR", "name": "Rand sud-africain", "symbol": "R", "rate_to_usd": 18.5},
    {"code": "SSP", "name": "Livre sud-soudanaise", "symbol": "£", "rate_to_usd": 950.0},
    {"code": "SDG", "name": "Livre soudanaise", "symbol": "ج.س.", "rate_to_usd": 600.0},
    {"code": "TZS", "name": "Shilling tanzanien", "symbol": "TSh", "rate_to_usd": 2500.0},
    {"code": "TND", "name": "Dinar tunisien", "symbol": "د.ت", "rate_to_usd": 3.1},
    {"code": "UGX", "name": "Shilling ougandais", "symbol": "USh", "rate_to_usd": 3750.0},
    {"code": "ZMW", "name": "Kwacha zambien", "symbol": "ZK", "rate_to_usd": 26.5},
    {"code": "ZWL", "name": "Dollar zimbabwéen", "symbol": "Z$", "rate_to_usd": 6500.0},
]

# All European currencies
EUROPEAN_CURRENCIES = [
    {"code": "EUR", "name": "Euro", "symbol": "€", "rate_to_usd": 0.92},
    {"code": "GBP", "name": "Livre Sterling", "symbol": "£", "rate_to_usd": 0.79},
    {"code": "CHF", "name": "Franc suisse", "symbol": "CHF", "rate_to_usd": 0.88},
    {"code": "NOK", "name": "Couronne norvégienne", "symbol": "kr", "rate_to_usd": 10.5},
    {"code": "SEK", "name": "Couronne suédoise", "symbol": "kr", "rate_to_usd": 10.3},
    {"code": "DKK", "name": "Couronne danoise", "symbol": "kr", "rate_to_usd": 6.9},
    {"code": "PLN", "name": "Zloty polonais", "symbol": "zł", "rate_to_usd": 4.0},
    {"code": "CZK", "name": "Couronne tchèque", "symbol": "Kč", "rate_to_usd": 22.5},
    {"code": "HUF", "name": "Forint hongrois", "symbol": "Ft", "rate_to_usd": 355.0},
    {"code": "RON", "name": "Leu roumain", "symbol": "lei", "rate_to_usd": 4.6},
    {"code": "BGN", "name": "Lev bulgare", "symbol": "лв", "rate_to_usd": 1.8},
    {"code": "HRK", "name": "Kuna croate", "symbol": "kn", "rate_to_usd": 7.0},
    {"code": "RSD", "name": "Dinar serbe", "symbol": "дин.", "rate_to_usd": 108.0},
    {"code": "BAM", "name": "Mark convertible", "symbol": "KM", "rate_to_usd": 1.8},
    {"code": "MKD", "name": "Denar macédonien", "symbol": "ден", "rate_to_usd": 56.5},
    {"code": "ALL", "name": "Lek albanais", "symbol": "L", "rate_to_usd": 95.0},
    {"code": "MDL", "name": "Leu moldave", "symbol": "L", "rate_to_usd": 17.8},
    {"code": "UAH", "name": "Hryvnia ukrainienne", "symbol": "₴", "rate_to_usd": 37.5},
    {"code": "BYN", "name": "Rouble biélorusse", "symbol": "Br", "rate_to_usd": 3.3},
    {"code": "RUB", "name": "Rouble russe", "symbol": "₽", "rate_to_usd": 92.0},
    {"code": "ISK", "name": "Couronne islandaise", "symbol": "kr", "rate_to_usd": 138.0},
    {"code": "TRY", "name": "Livre turque", "symbol": "₺", "rate_to_usd": 32.0},
    {"code": "GEL", "name": "Lari géorgien", "symbol": "₾", "rate_to_usd": 2.7},
    {"code": "AMD", "name": "Dram arménien", "symbol": "֏", "rate_to_usd": 405.0},
    {"code": "AZN", "name": "Manat azerbaïdjanais", "symbol": "₼", "rate_to_usd": 1.7},
]

# Other major currencies
OTHER_CURRENCIES = [
    {"code": "USD", "name": "Dollar US", "symbol": "$", "rate_to_usd": 1.0},
    {"code": "CAD", "name": "Dollar canadien", "symbol": "C$", "rate_to_usd": 1.36},
    {"code": "AUD", "name": "Dollar australien", "symbol": "A$", "rate_to_usd": 1.53},
    {"code": "JPY", "name": "Yen japonais", "symbol": "¥", "rate_to_usd": 149.0},
    {"code": "CNY", "name": "Yuan chinois", "symbol": "¥", "rate_to_usd": 7.2},
    {"code": "INR", "name": "Roupie indienne", "symbol": "₹", "rate_to_usd": 83.0},
    {"code": "BRL", "name": "Real brésilien", "symbol": "R$", "rate_to_usd": 4.95},
    {"code": "AED", "name": "Dirham des EAU", "symbol": "د.إ", "rate_to_usd": 3.67},
    {"code": "SAR", "name": "Riyal saoudien", "symbol": "﷼", "rate_to_usd": 3.75},
]

async def add_currencies():
    """Add all currencies to the database"""
    all_currencies = AFRICAN_CURRENCIES + EUROPEAN_CURRENCIES + OTHER_CURRENCIES
    added = 0
    updated = 0
    
    for curr in all_currencies:
        existing = await db.currencies.find_one({"code": curr["code"]})
        if existing:
            # Update rate
            await db.currencies.update_one(
                {"code": curr["code"]},
                {"$set": {
                    "rate_to_usd": curr["rate_to_usd"],
                    "last_updated": now_iso()
                }}
            )
            updated += 1
        else:
            await db.currencies.insert_one({
                "id": gen_id(),
                "code": curr["code"],
                "name": curr["name"],
                "symbol": curr["symbol"],
                "rate_to_usd": curr["rate_to_usd"],
                "is_active": True,
                "last_updated": now_iso()
            })
            added += 1
    
    print(f"Currencies: {added} added, {updated} updated")
    return added, updated

# Default service configuration for countries
DEFAULT_SERVICES = {
    # National services
    "send_national": True,
    "receive_national": True,
    "deposit": True,
    "withdrawal": True,
    "savings": True,
    "contribution": True,  # Cotisation/Tontine
    "currency_conversion": True,
    
    # International services
    "send_international": True,
    "receive_international": True,
    "withdrawal_international": True,
    "contribution_international": True,
    
    # Cards
    "virtual_cards": True,
}

async def add_service_config_to_countries():
    """Add service configuration to all countries"""
    countries = await db.countries.find({}).to_list(100)
    updated = 0
    
    for country in countries:
        # Check if services config exists
        if "services" not in country:
            await db.countries.update_one(
                {"id": country["id"]},
                {"$set": {
                    "services": DEFAULT_SERVICES.copy(),
                    "services_updated_at": now_iso()
                }}
            )
            updated += 1
    
    print(f"Countries updated with services config: {updated}")
    return updated

# All African countries
AFRICAN_COUNTRIES = [
    {"code": "DZ", "name": "Algérie", "dial_code": "+213", "currency_code": "DZD", "flag": "🇩🇿"},
    {"code": "AO", "name": "Angola", "dial_code": "+244", "currency_code": "AOA", "flag": "🇦🇴"},
    {"code": "BJ", "name": "Bénin", "dial_code": "+229", "currency_code": "XOF", "flag": "🇧🇯"},
    {"code": "BW", "name": "Botswana", "dial_code": "+267", "currency_code": "BWP", "flag": "🇧🇼"},
    {"code": "BF", "name": "Burkina Faso", "dial_code": "+226", "currency_code": "XOF", "flag": "🇧🇫"},
    {"code": "BI", "name": "Burundi", "dial_code": "+257", "currency_code": "BIF", "flag": "🇧🇮"},
    {"code": "CV", "name": "Cap-Vert", "dial_code": "+238", "currency_code": "CVE", "flag": "🇨🇻"},
    {"code": "CM", "name": "Cameroun", "dial_code": "+237", "currency_code": "XAF", "flag": "🇨🇲"},
    {"code": "CF", "name": "Centrafrique", "dial_code": "+236", "currency_code": "XAF", "flag": "🇨🇫"},
    {"code": "TD", "name": "Tchad", "dial_code": "+235", "currency_code": "XAF", "flag": "🇹🇩"},
    {"code": "KM", "name": "Comores", "dial_code": "+269", "currency_code": "KMF", "flag": "🇰🇲"},
    {"code": "CG", "name": "Congo-Brazzaville", "dial_code": "+242", "currency_code": "XAF", "flag": "🇨🇬"},
    {"code": "CD", "name": "RD Congo", "dial_code": "+243", "currency_code": "CDF", "flag": "🇨🇩"},
    {"code": "CI", "name": "Côte d'Ivoire", "dial_code": "+225", "currency_code": "XOF", "flag": "🇨🇮"},
    {"code": "DJ", "name": "Djibouti", "dial_code": "+253", "currency_code": "DJF", "flag": "🇩🇯"},
    {"code": "EG", "name": "Égypte", "dial_code": "+20", "currency_code": "EGP", "flag": "🇪🇬"},
    {"code": "GQ", "name": "Guinée Équatoriale", "dial_code": "+240", "currency_code": "XAF", "flag": "🇬🇶"},
    {"code": "ER", "name": "Érythrée", "dial_code": "+291", "currency_code": "ERN", "flag": "🇪🇷"},
    {"code": "SZ", "name": "Eswatini", "dial_code": "+268", "currency_code": "SZL", "flag": "🇸🇿"},
    {"code": "ET", "name": "Éthiopie", "dial_code": "+251", "currency_code": "ETB", "flag": "🇪🇹"},
    {"code": "GA", "name": "Gabon", "dial_code": "+241", "currency_code": "XAF", "flag": "🇬🇦"},
    {"code": "GM", "name": "Gambie", "dial_code": "+220", "currency_code": "GMD", "flag": "🇬🇲"},
    {"code": "GH", "name": "Ghana", "dial_code": "+233", "currency_code": "GHS", "flag": "🇬🇭"},
    {"code": "GN", "name": "Guinée", "dial_code": "+224", "currency_code": "GNF", "flag": "🇬🇳"},
    {"code": "GW", "name": "Guinée-Bissau", "dial_code": "+245", "currency_code": "XOF", "flag": "🇬🇼"},
    {"code": "KE", "name": "Kenya", "dial_code": "+254", "currency_code": "KES", "flag": "🇰🇪"},
    {"code": "LS", "name": "Lesotho", "dial_code": "+266", "currency_code": "LSL", "flag": "🇱🇸"},
    {"code": "LR", "name": "Liberia", "dial_code": "+231", "currency_code": "LRD", "flag": "🇱🇷"},
    {"code": "LY", "name": "Libye", "dial_code": "+218", "currency_code": "LYD", "flag": "🇱🇾"},
    {"code": "MG", "name": "Madagascar", "dial_code": "+261", "currency_code": "MGA", "flag": "🇲🇬"},
    {"code": "MW", "name": "Malawi", "dial_code": "+265", "currency_code": "MWK", "flag": "🇲🇼"},
    {"code": "ML", "name": "Mali", "dial_code": "+223", "currency_code": "XOF", "flag": "🇲🇱"},
    {"code": "MR", "name": "Mauritanie", "dial_code": "+222", "currency_code": "MRU", "flag": "🇲🇷"},
    {"code": "MU", "name": "Maurice", "dial_code": "+230", "currency_code": "MUR", "flag": "🇲🇺"},
    {"code": "MA", "name": "Maroc", "dial_code": "+212", "currency_code": "MAD", "flag": "🇲🇦"},
    {"code": "MZ", "name": "Mozambique", "dial_code": "+258", "currency_code": "MZN", "flag": "🇲🇿"},
    {"code": "NA", "name": "Namibie", "dial_code": "+264", "currency_code": "NAD", "flag": "🇳🇦"},
    {"code": "NE", "name": "Niger", "dial_code": "+227", "currency_code": "XOF", "flag": "🇳🇪"},
    {"code": "NG", "name": "Nigeria", "dial_code": "+234", "currency_code": "NGN", "flag": "🇳🇬"},
    {"code": "RW", "name": "Rwanda", "dial_code": "+250", "currency_code": "RWF", "flag": "🇷🇼"},
    {"code": "ST", "name": "São Tomé-et-Príncipe", "dial_code": "+239", "currency_code": "STN", "flag": "🇸🇹"},
    {"code": "SN", "name": "Sénégal", "dial_code": "+221", "currency_code": "XOF", "flag": "🇸🇳"},
    {"code": "SC", "name": "Seychelles", "dial_code": "+248", "currency_code": "SCR", "flag": "🇸🇨"},
    {"code": "SL", "name": "Sierra Leone", "dial_code": "+232", "currency_code": "SLL", "flag": "🇸🇱"},
    {"code": "SO", "name": "Somalie", "dial_code": "+252", "currency_code": "SOS", "flag": "🇸🇴"},
    {"code": "ZA", "name": "Afrique du Sud", "dial_code": "+27", "currency_code": "ZAR", "flag": "🇿🇦"},
    {"code": "SS", "name": "Soudan du Sud", "dial_code": "+211", "currency_code": "SSP", "flag": "🇸🇸"},
    {"code": "SD", "name": "Soudan", "dial_code": "+249", "currency_code": "SDG", "flag": "🇸🇩"},
    {"code": "TZ", "name": "Tanzanie", "dial_code": "+255", "currency_code": "TZS", "flag": "🇹🇿"},
    {"code": "TG", "name": "Togo", "dial_code": "+228", "currency_code": "XOF", "flag": "🇹🇬"},
    {"code": "TN", "name": "Tunisie", "dial_code": "+216", "currency_code": "TND", "flag": "🇹🇳"},
    {"code": "UG", "name": "Ouganda", "dial_code": "+256", "currency_code": "UGX", "flag": "🇺🇬"},
    {"code": "ZM", "name": "Zambie", "dial_code": "+260", "currency_code": "ZMW", "flag": "🇿🇲"},
    {"code": "ZW", "name": "Zimbabwe", "dial_code": "+263", "currency_code": "ZWL", "flag": "🇿🇼"},
]

# European countries
EUROPEAN_COUNTRIES = [
    {"code": "AL", "name": "Albanie", "dial_code": "+355", "currency_code": "ALL", "flag": "🇦🇱"},
    {"code": "AD", "name": "Andorre", "dial_code": "+376", "currency_code": "EUR", "flag": "🇦🇩"},
    {"code": "AT", "name": "Autriche", "dial_code": "+43", "currency_code": "EUR", "flag": "🇦🇹"},
    {"code": "BY", "name": "Biélorussie", "dial_code": "+375", "currency_code": "BYN", "flag": "🇧🇾"},
    {"code": "BE", "name": "Belgique", "dial_code": "+32", "currency_code": "EUR", "flag": "🇧🇪"},
    {"code": "BA", "name": "Bosnie-Herzégovine", "dial_code": "+387", "currency_code": "BAM", "flag": "🇧🇦"},
    {"code": "BG", "name": "Bulgarie", "dial_code": "+359", "currency_code": "BGN", "flag": "🇧🇬"},
    {"code": "HR", "name": "Croatie", "dial_code": "+385", "currency_code": "EUR", "flag": "🇭🇷"},
    {"code": "CY", "name": "Chypre", "dial_code": "+357", "currency_code": "EUR", "flag": "🇨🇾"},
    {"code": "CZ", "name": "Tchéquie", "dial_code": "+420", "currency_code": "CZK", "flag": "🇨🇿"},
    {"code": "DK", "name": "Danemark", "dial_code": "+45", "currency_code": "DKK", "flag": "🇩🇰"},
    {"code": "EE", "name": "Estonie", "dial_code": "+372", "currency_code": "EUR", "flag": "🇪🇪"},
    {"code": "FI", "name": "Finlande", "dial_code": "+358", "currency_code": "EUR", "flag": "🇫🇮"},
    {"code": "FR", "name": "France", "dial_code": "+33", "currency_code": "EUR", "flag": "🇫🇷"},
    {"code": "GE", "name": "Géorgie", "dial_code": "+995", "currency_code": "GEL", "flag": "🇬🇪"},
    {"code": "DE", "name": "Allemagne", "dial_code": "+49", "currency_code": "EUR", "flag": "🇩🇪"},
    {"code": "GR", "name": "Grèce", "dial_code": "+30", "currency_code": "EUR", "flag": "🇬🇷"},
    {"code": "HU", "name": "Hongrie", "dial_code": "+36", "currency_code": "HUF", "flag": "🇭🇺"},
    {"code": "IS", "name": "Islande", "dial_code": "+354", "currency_code": "ISK", "flag": "🇮🇸"},
    {"code": "IE", "name": "Irlande", "dial_code": "+353", "currency_code": "EUR", "flag": "🇮🇪"},
    {"code": "IT", "name": "Italie", "dial_code": "+39", "currency_code": "EUR", "flag": "🇮🇹"},
    {"code": "XK", "name": "Kosovo", "dial_code": "+383", "currency_code": "EUR", "flag": "🇽🇰"},
    {"code": "LV", "name": "Lettonie", "dial_code": "+371", "currency_code": "EUR", "flag": "🇱🇻"},
    {"code": "LI", "name": "Liechtenstein", "dial_code": "+423", "currency_code": "CHF", "flag": "🇱🇮"},
    {"code": "LT", "name": "Lituanie", "dial_code": "+370", "currency_code": "EUR", "flag": "🇱🇹"},
    {"code": "LU", "name": "Luxembourg", "dial_code": "+352", "currency_code": "EUR", "flag": "🇱🇺"},
    {"code": "MT", "name": "Malte", "dial_code": "+356", "currency_code": "EUR", "flag": "🇲🇹"},
    {"code": "MD", "name": "Moldavie", "dial_code": "+373", "currency_code": "MDL", "flag": "🇲🇩"},
    {"code": "MC", "name": "Monaco", "dial_code": "+377", "currency_code": "EUR", "flag": "🇲🇨"},
    {"code": "ME", "name": "Monténégro", "dial_code": "+382", "currency_code": "EUR", "flag": "🇲🇪"},
    {"code": "NL", "name": "Pays-Bas", "dial_code": "+31", "currency_code": "EUR", "flag": "🇳🇱"},
    {"code": "MK", "name": "Macédoine du Nord", "dial_code": "+389", "currency_code": "MKD", "flag": "🇲🇰"},
    {"code": "NO", "name": "Norvège", "dial_code": "+47", "currency_code": "NOK", "flag": "🇳🇴"},
    {"code": "PL", "name": "Pologne", "dial_code": "+48", "currency_code": "PLN", "flag": "🇵🇱"},
    {"code": "PT", "name": "Portugal", "dial_code": "+351", "currency_code": "EUR", "flag": "🇵🇹"},
    {"code": "RO", "name": "Roumanie", "dial_code": "+40", "currency_code": "RON", "flag": "🇷🇴"},
    {"code": "RU", "name": "Russie", "dial_code": "+7", "currency_code": "RUB", "flag": "🇷🇺"},
    {"code": "SM", "name": "Saint-Marin", "dial_code": "+378", "currency_code": "EUR", "flag": "🇸🇲"},
    {"code": "RS", "name": "Serbie", "dial_code": "+381", "currency_code": "RSD", "flag": "🇷🇸"},
    {"code": "SK", "name": "Slovaquie", "dial_code": "+421", "currency_code": "EUR", "flag": "🇸🇰"},
    {"code": "SI", "name": "Slovénie", "dial_code": "+386", "currency_code": "EUR", "flag": "🇸🇮"},
    {"code": "ES", "name": "Espagne", "dial_code": "+34", "currency_code": "EUR", "flag": "🇪🇸"},
    {"code": "SE", "name": "Suède", "dial_code": "+46", "currency_code": "SEK", "flag": "🇸🇪"},
    {"code": "CH", "name": "Suisse", "dial_code": "+41", "currency_code": "CHF", "flag": "🇨🇭"},
    {"code": "TR", "name": "Turquie", "dial_code": "+90", "currency_code": "TRY", "flag": "🇹🇷"},
    {"code": "UA", "name": "Ukraine", "dial_code": "+380", "currency_code": "UAH", "flag": "🇺🇦"},
    {"code": "GB", "name": "Royaume-Uni", "dial_code": "+44", "currency_code": "GBP", "flag": "🇬🇧"},
    {"code": "VA", "name": "Vatican", "dial_code": "+379", "currency_code": "EUR", "flag": "🇻🇦"},
]

async def add_countries():
    """Add all African and European countries"""
    all_countries = AFRICAN_COUNTRIES + EUROPEAN_COUNTRIES
    added = 0
    updated = 0
    
    for country in all_countries:
        existing = await db.countries.find_one({"code": country["code"]})
        if existing:
            # Update with services if not present
            if "services" not in existing:
                await db.countries.update_one(
                    {"code": country["code"]},
                    {"$set": {
                        "services": DEFAULT_SERVICES.copy(),
                        "services_updated_at": now_iso()
                    }}
                )
            updated += 1
        else:
            await db.countries.insert_one({
                "id": gen_id(),
                "code": country["code"],
                "name": country["name"],
                "dial_code": country["dial_code"],
                "currency_code": country["currency_code"],
                "flag": country["flag"],
                "is_active": True,
                "services": DEFAULT_SERVICES.copy(),
                "services_updated_at": now_iso(),
                "created_at": now_iso()
            })
            added += 1
    
    print(f"Countries: {added} added, {updated} updated")
    return added, updated

async def main():
    print("=== Adding currencies and countries with services ===")
    
    # Add currencies
    await add_currencies()
    
    # Add countries
    await add_countries()
    
    # Update existing countries with services config
    await add_service_config_to_countries()
    
    # Print final counts
    curr_count = await db.currencies.count_documents({})
    country_count = await db.countries.count_documents({})
    print(f"\nFinal counts: {curr_count} currencies, {country_count} countries")

if __name__ == "__main__":
    asyncio.run(main())
