import { createContext, useContext, useState } from 'react';

const translations = {
  fr: {
    dashboard: 'Tableau de bord', send: 'Envoyer', receive: 'Recevoir',
    recharge: 'Recharger', withdraw: 'Retirer', history: 'Historique',
    wallet: 'Portefeuille', savings: 'Épargne', cotisation: 'Cotisation',
    referral: 'Parrainage', profile: 'Profil', logout: 'Déconnexion',
    balance: 'Solde', total_balance: 'Solde Total', recent_tx: 'Transactions récentes',
    no_tx: 'Aucune transaction', loading: 'Chargement...', error: 'Erreur',
    success: 'Succès', cancel: 'Annuler', confirm: 'Confirmer', save: 'Enregistrer',
    amount: 'Montant', currency: 'Devise', description: 'Description',
    phone: 'Téléphone', password: 'Mot de passe', name: 'Nom complet',
    country: 'Pays', login: 'Se connecter', register: "S'inscrire",
    otp: 'Code OTP', verify: 'Vérifier', admin: 'Admin',
    users: 'Utilisateurs', transactions: 'Transactions', currencies: 'Devises',
    settings: 'Paramètres', pending: 'En attente', completed: 'Complété',
    rejected: 'Rejeté', approve: 'Approuver', reject: 'Rejeter',
    transfer: 'Transfert', type: 'Type', status: 'Statut', date: 'Date',
    fee: 'Frais', total: 'Total', from: 'De', to: 'À', card: 'Carte',
    add_card: 'Ajouter une carte', lock: 'Verrouiller', unlock: 'Déverrouiller',
    create_savings: 'Créer une épargne', fixed: 'Fixe', flexible: 'Flexible',
    create_group: 'Créer un groupe', join_group: 'Rejoindre',
    referral_code: 'Code de parrainage', copy: 'Copier', share: 'Partager',
    kyc: 'KYC', upload: 'Télécharger', submitted: 'Soumis', approved: 'Approuvé',
    management: 'Gestion', notifications: 'Notifications', all: 'Tous',
    search: 'Rechercher', actions: 'Actions', edit: 'Modifier', delete: 'Supprimer',
    page: 'Page', of: 'sur', next: 'Suivant', prev: 'Précédent',
    welcome: 'Bienvenue', good_morning: 'Bonjour', account: 'Compte',
    nfc_card: 'Carte NFC', virtual_card: 'Carte Virtuelle',
    monthly: 'Mensuel', weekly: 'Hebdomadaire',
  },
  en: {
    dashboard: 'Dashboard', send: 'Send', receive: 'Receive',
    recharge: 'Top Up', withdraw: 'Withdraw', history: 'History',
    wallet: 'Wallet', savings: 'Savings', cotisation: 'Group Savings',
    referral: 'Referral', profile: 'Profile', logout: 'Logout',
    balance: 'Balance', total_balance: 'Total Balance', recent_tx: 'Recent Transactions',
    no_tx: 'No transactions', loading: 'Loading...', error: 'Error',
    success: 'Success', cancel: 'Cancel', confirm: 'Confirm', save: 'Save',
    amount: 'Amount', currency: 'Currency', description: 'Description',
    phone: 'Phone', password: 'Password', name: 'Full Name',
    country: 'Country', login: 'Login', register: 'Register',
    otp: 'OTP Code', verify: 'Verify', admin: 'Admin',
    users: 'Users', transactions: 'Transactions', currencies: 'Currencies',
    settings: 'Settings', pending: 'Pending', completed: 'Completed',
    rejected: 'Rejected', approve: 'Approve', reject: 'Reject',
    transfer: 'Transfer', type: 'Type', status: 'Status', date: 'Date',
    fee: 'Fee', total: 'Total', from: 'From', to: 'To', card: 'Card',
    add_card: 'Add Card', lock: 'Lock', unlock: 'Unlock',
    create_savings: 'Create Savings', fixed: 'Fixed', flexible: 'Flexible',
    create_group: 'Create Group', join_group: 'Join',
    referral_code: 'Referral Code', copy: 'Copy', share: 'Share',
    kyc: 'KYC', upload: 'Upload', submitted: 'Submitted', approved: 'Approved',
    management: 'Management', notifications: 'Notifications', all: 'All',
    search: 'Search', actions: 'Actions', edit: 'Edit', delete: 'Delete',
    page: 'Page', of: 'of', next: 'Next', prev: 'Previous',
    welcome: 'Welcome', good_morning: 'Good morning', account: 'Account',
    nfc_card: 'NFC Card', virtual_card: 'Virtual Card',
    monthly: 'Monthly', weekly: 'Weekly',
  }
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem('monity_lang') || 'fr');

  const changeLang = (l) => {
    setLang(l);
    localStorage.setItem('monity_lang', l);
  };

  const t = (key) => translations[lang]?.[key] || translations['fr']?.[key] || key;

  return (
    <LanguageContext.Provider value={{ lang, changeLang, t, languages: ['fr', 'en', 'es', 'zh', 'ru', 'ln'] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
