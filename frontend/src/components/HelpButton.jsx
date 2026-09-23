import { useState } from 'react';
import { HelpCircle, X, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';

// Help content for each page/section
const HELP_CONTENT = {
  // Dashboard
  '/dashboard': {
    title: 'Tableau de bord',
    description: 'Votre espace personnel pour gérer vos finances',
    sections: [
      { title: 'Solde total', content: 'Affiche le solde combiné de tous vos portefeuilles en USD.' },
      { title: 'Portefeuilles', content: 'Gérez vos différentes devises. Vous pouvez avoir jusqu\'à 2 portefeuilles actifs.' },
      { title: 'Transactions récentes', content: 'Historique de vos dernières opérations financières.' },
      { title: 'Actions rapides', content: 'Accédez rapidement aux fonctions d\'envoi, réception et recharge.' }
    ]
  },
  '/wallet': {
    title: 'Portefeuilles',
    description: 'Gérez vos différents portefeuilles de devises',
    sections: [
      { title: 'Limite de portefeuilles', content: 'Vous pouvez avoir maximum 2 portefeuilles. Pour en créer un nouveau, vous devez d\'abord en supprimer ou convertir un existant.' },
      { title: 'Conversion', content: 'Convertissez instantanément entre devises avec des taux en temps réel.' },
      { title: 'Supprimer un portefeuille', content: 'Le solde sera automatiquement transféré vers votre portefeuille principal.' }
    ]
  },
  '/send': {
    title: 'Envoyer de l\'argent',
    description: 'Transférez des fonds vers d\'autres utilisateurs',
    sections: [
      { title: 'Par téléphone', content: 'Entrez le numéro du destinataire avec l\'indicatif pays.' },
      { title: 'Par QR Code', content: 'Scannez le QR code du destinataire pour un transfert rapide.' },
      { title: 'Frais', content: 'Les frais de transfert sont calculés automatiquement et affichés avant confirmation.' }
    ]
  },
  '/receive': {
    title: 'Recevoir de l\'argent',
    description: 'Recevez des paiements facilement',
    sections: [
      { title: 'QR Code', content: 'Partagez votre QR code pour recevoir des paiements instantanés.' },
      { title: 'Lien de paiement', content: 'Créez un lien personnalisé avec montant prédéfini.' },
      { title: 'Numéro de compte', content: 'Partagez votre numéro de compte Monity World.' }
    ]
  },
  '/cards': {
    title: 'Cartes NFC',
    description: 'Gérez vos cartes de paiement NFC',
    sections: [
      { title: 'Carte physique', content: 'Utilisez votre carte NFC pour des paiements sans contact chez les marchands partenaires.' },
      { title: 'Carte virtuelle', content: 'Créez une carte virtuelle pour vos achats en ligne.' },
      { title: 'Limites', content: 'Configurez les plafonds de dépenses pour plus de sécurité.' }
    ]
  },
  '/settings': {
    title: 'Paramètres',
    description: 'Personnalisez votre compte',
    sections: [
      { title: 'Profil', content: 'Modifiez vos informations personnelles et photo de profil.' },
      { title: 'Sécurité', content: 'Activez la double authentification pour plus de sécurité.' },
      { title: 'Notifications', content: 'Gérez vos préférences de notifications WhatsApp et email.' }
    ]
  },
  '/ecommerce-links': {
    title: 'Liens E-commerce',
    description: 'Intégrez les paiements sur vos sites web',
    sections: [
      { title: 'Liens de paiement', content: 'Créez des liens de paiement uniques ou permanents pour vos clients.' },
      { title: 'Clés API', content: 'Générez des clés API pour intégrer Monity World dans votre application.' },
      { title: 'Webhooks', content: 'Configurez les notifications automatiques pour vos transactions.' }
    ]
  },
  // Admin pages
  '/admin': {
    title: 'Administration',
    description: 'Centre de contrôle administrateur',
    sections: [
      { title: 'Vue d\'ensemble', content: 'Statistiques globales de la plateforme.' },
      { title: 'Alertes', content: 'Notifications importantes nécessitant votre attention.' }
    ]
  },
  '/admin/users': {
    title: 'Gestion des utilisateurs',
    description: 'Gérez les comptes utilisateurs',
    sections: [
      { title: 'Recherche', content: 'Trouvez un utilisateur par nom, email ou téléphone.' },
      { title: 'Actions', content: 'Activez, suspendez ou modifiez les comptes utilisateurs.' },
      { title: 'KYC', content: 'Vérifiez les documents d\'identité des utilisateurs.' }
    ]
  },
  '/admin/transactions': {
    title: 'Transactions',
    description: 'Supervision des transactions',
    sections: [
      { title: 'Filtres', content: 'Filtrez par date, statut, montant ou type de transaction.' },
      { title: 'Exportation', content: 'Exportez les données pour la comptabilité.' },
      { title: 'Détails', content: 'Cliquez sur une transaction pour voir tous les détails.' }
    ]
  },
  '/admin/api-integrations': {
    title: 'Intégrations API',
    description: 'Connectez des services financiers externes',
    sections: [
      { title: 'Créer une intégration', content: 'Sélectionnez le type (bancaire, mobile money, crypto...) et configurez les paramètres API.' },
      { title: 'Test de connexion', content: 'Vérifiez que la connexion fonctionne avant d\'activer l\'intégration.' },
      { title: 'Frais', content: 'Configurez les frais de dépôt et retrait pour chaque intégration.' },
      { title: 'Mode test', content: 'Activez le mode test pour tester sans transactions réelles.' }
    ]
  },
  '/admin/whatsapp': {
    title: 'Configuration WhatsApp',
    description: 'Gérez les services de messagerie',
    sections: [
      { title: 'Session WhatsApp', content: 'Scannez le QR code pour connecter votre numéro WhatsApp professionnel.' },
      { title: 'API SMS', content: 'Configurez un service SMS de secours si WhatsApp n\'est pas disponible.' },
      { title: 'Pays', content: 'Assignez différentes configurations par pays.' }
    ]
  }
};

// Default help content
const DEFAULT_HELP = {
  title: 'Aide',
  description: 'Bienvenue dans l\'aide de Monity World',
  sections: [
    { title: 'Navigation', content: 'Utilisez le menu latéral pour naviguer entre les différentes sections.' },
    { title: 'Support', content: 'Pour toute question, contactez notre support via WhatsApp.' },
    { title: 'Sécurité', content: 'Ne partagez jamais vos identifiants avec qui que ce soit.' }
  ]
};

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);
  
  // Get current path and find matching help content
  const currentPath = window.location.pathname;
  const helpContent = HELP_CONTENT[currentPath] || 
    Object.entries(HELP_CONTENT).find(([path]) => currentPath.startsWith(path))?.[1] || 
    DEFAULT_HELP;

  return (
    <>
      {/* Help Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-40 bg-card/80 backdrop-blur-sm border border-border hover:bg-primary/10 hover:border-primary/50 transition-all"
        data-testid="help-button"
      >
        <HelpCircle size={18} className="text-primary" />
        <span className="ml-2 text-sm hidden sm:inline">Aide</span>
      </Button>

      {/* Help Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-end z-50 p-4 animate-fade-in">
          <div 
            className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden shadow-2xl animate-slide-in-right mt-12"
            data-testid="help-modal"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <HelpCircle size={20} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>
                      {helpContent.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {helpContent.description}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(80vh-120px)] p-4 space-y-2">
              {helpContent.sections.map((section, index) => (
                <div 
                  key={index}
                  className="bg-secondary/30 rounded-xl overflow-hidden border border-border/50 hover:border-primary/30 transition-colors"
                >
                  <button
                    onClick={() => setExpandedSection(expandedSection === index ? null : index)}
                    className="w-full p-3 flex items-center justify-between text-left"
                  >
                    <span className="font-medium text-foreground text-sm">{section.title}</span>
                    <ChevronRight 
                      size={16} 
                      className={`text-muted-foreground transition-transform ${expandedSection === index ? 'rotate-90' : ''}`} 
                    />
                  </button>
                  {expandedSection === index && (
                    <div className="px-3 pb-3 animate-fade-in">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {section.content}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-border p-4 bg-secondary/20">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Besoin d'aide supplémentaire ?
                </p>
                <a 
                  href="https://wa.me/12407613903" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Contacter le support
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Styles for animations */}
      <style>{`
        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
