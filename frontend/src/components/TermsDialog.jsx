import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';

export const TERMS_VERSION = '1.0';

const SECTIONS = [
  {
    title: '1. Objet et acceptation',
    items: [
      "Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme Monity World (site web et application mobile).",
      "La création d'un compte implique l'acceptation pleine et entière des CGU. Sans cette acceptation, l'inscription est impossible.",
      "Vous déclarez être majeur(e) et avoir la capacité juridique de contracter dans votre pays de résidence.",
    ],
  },
  {
    title: '2. Fonctionnalités proposées',
    items: [
      "Portefeuilles multi-devises et suivi des soldes.",
      "Dépôts, retraits et transferts d'argent entre comptes et vers d'autres pays, selon les corridors et moyens de paiement disponibles.",
      "Cartes virtuelles et cartes NFC liées à votre compte.",
      "Notifications et codes de vérification (OTP) envoyés par WhatsApp, SMS ou e-mail.",
      "Programme de parrainage, support client et historique des opérations.",
      "Les fonctionnalités, plafonds, frais et taux de change peuvent varier selon votre pays, votre niveau de vérification (KYC) et peuvent être modifiés à tout moment.",
    ],
  },
  {
    title: '3. Vérification d’identité (KYC) et conformité',
    items: [
      "Vous devez fournir des informations exactes, complètes et à jour, et des documents d'identité authentiques.",
      "Certaines opérations sont soumises à la validation de votre identité. Monity World peut demander des justificatifs supplémentaires à tout moment.",
      "Monity World applique les règles de lutte contre le blanchiment d'argent et le financement du terrorisme et peut signaler toute opération suspecte aux autorités compétentes.",
    ],
  },
  {
    title: '4. Risques liés à l’utilisation du service',
    items: [
      "Risque de change : les taux de change fluctuent ; la valeur reçue peut différer de celle estimée au moment de la demande.",
      "Risque de fraude et d'hameçonnage : ne communiquez jamais votre mot de passe, vos codes OTP ou votre code PIN, y compris à une personne se présentant comme Monity World.",
      "Risque d'erreur : une opération envoyée vers un mauvais numéro, compte ou bénéficiaire peut être irréversible. Vérifiez toujours les informations avant de valider.",
      "Risque de retard ou d'indisponibilité : les opérations peuvent être retardées ou suspendues en raison de contrôles de conformité, de pannes techniques, de partenaires de paiement, de réseaux de télécommunication ou de cas de force majeure.",
      "Risque de blocage ou de gel : un compte ou une opération peut être suspendu en cas de suspicion de fraude, d'informations inexactes ou de demande d'une autorité.",
      "Risque lié à la sécurité de votre appareil : un téléphone ou un ordinateur perdu, volé ou infecté peut permettre un accès non autorisé à votre compte. Vous restez responsable de la confidentialité de vos identifiants.",
      "Le solde d'un portefeuille n'est pas un dépôt bancaire et n'est pas garanti par un système de garantie des dépôts, sauf disposition légale contraire.",
      "Monity World n'est pas un conseiller financier ; n'engagez que des sommes dont vous pouvez supporter le risque d'immobilisation ou de perte.",
    ],
  },
  {
    title: '5. Vos obligations',
    items: [
      "Utiliser le service uniquement à des fins licites et pour votre propre compte ; ne pas prêter ni revendre votre compte.",
      "Ne pas utiliser la plateforme pour des activités frauduleuses, illicites, de blanchiment ou de financement d'activités criminelles.",
      "Informer immédiatement le support en cas de perte, vol ou utilisation non autorisée de vos identifiants.",
      "Un seul compte par personne, sauf autorisation expresse.",
    ],
  },
  {
    title: '6. Frais, limites et responsabilité',
    items: [
      "Les frais et taux applicables sont affichés avant la validation de chaque opération ; en la validant, vous les acceptez.",
      "Monity World met en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité du service, sans garantir un fonctionnement ininterrompu.",
      "Dans les limites permises par la loi, Monity World n'est pas responsable des pertes résultant de votre négligence, d'une fausse information, d'une erreur de saisie, de la faute d'un tiers ou d'un cas de force majeure.",
    ],
  },
  {
    title: '7. Données personnelles',
    items: [
      "Vos données sont collectées et traitées pour créer et gérer votre compte, exécuter vos opérations, sécuriser le service, respecter nos obligations légales et vous contacter.",
      "Elles peuvent être partagées avec nos prestataires de paiement et de vérification, ainsi qu'avec les autorités lorsque la loi l'exige. Vous pouvez demander l'accès, la rectification ou la suppression de vos données via le support, sous réserve des obligations légales de conservation.",
    ],
  },
  {
    title: '8. Suspension, résiliation et modification',
    items: [
      "Monity World peut suspendre ou clôturer un compte en cas de non-respect des CGU ou d'obligation légale. Vous pouvez demander la clôture de votre compte à tout moment, après règlement des opérations en cours.",
      "Les CGU peuvent évoluer. Les modifications importantes vous seront notifiées ; la poursuite de l'utilisation du service vaut acceptation.",
    ],
  },
];

export default function TermsDialog({ open, onOpenChange, onAccept }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="terms-dialog">
        <DialogHeader>
          <DialogTitle>Conditions Générales d'Utilisation</DialogTitle>
          <DialogDescription>
            Version {TERMS_VERSION} — Veuillez lire attentivement les fonctionnalités et les risques avant de créer votre compte.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto pr-2 space-y-4 text-sm text-muted-foreground">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="font-semibold text-foreground mb-1">{s.title}</h3>
              <ul className="list-disc pl-5 space-y-1">
                {s.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          {onAccept && (
            <Button onClick={() => { onAccept(); onOpenChange(false); }} data-testid="terms-accept-btn">
              J'ai lu et j'accepte
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
