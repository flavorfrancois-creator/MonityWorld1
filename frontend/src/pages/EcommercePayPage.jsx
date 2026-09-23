import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Link2, ArrowDownLeft, ArrowUpRight, Phone, 
  DollarSign, Send, Shield, CheckCircle, Loader2
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

export default function EcommercePayPage() {
  const { linkCode } = useParams();
  const navigate = useNavigate();
  
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Form state
  const [step, setStep] = useState(1); // 1: phone, 2: amount (if needed), 3: code
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [validationCode, setValidationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [txResult, setTxResult] = useState(null);

  const fetchLink = useCallback(async () => {
    try {
      const res = await API.get(`/ecommerce-links/public/${linkCode}`);
      setLink(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Lien non trouvé ou expiré');
    } finally {
      setLoading(false);
    }
  }, [linkCode]);

  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  const requestCode = async () => {
    const phone = link.link_type === 'send' ? receiverPhone : senderPhone;
    
    if (!phone || phone.length < 8) {
      toast.error('Numéro de téléphone invalide');
      return;
    }
    
    // For send links, we need the sender's phone (link creator) to receive the code
    // But the external site provides the receiver's phone
    // Actually, for send links, the validation code should be sent to the link creator
    // Let's adjust: for send links, we need to request code differently
    
    setProcessing(true);
    try {
      if (link.link_type === 'receive') {
        // For receive links, code is sent to the payer (senderPhone)
        await API.post(`/ecommerce-links/${linkCode}/request-code`, null, {
          params: { sender_phone: senderPhone }
        });
        toast.success('Code de validation envoyé !');
      } else {
        // For send links, we need to handle it differently
        // The code should be requested by the site and sent to the link creator
        await API.post(`/ecommerce-links/${linkCode}/request-code`, null, {
          params: { sender_phone: link.creator_phone || senderPhone }
        });
        toast.success('Code de validation envoyé au propriétaire du lien !');
      }
      setCodeSent(true);
      setStep(3);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur d\'envoi du code');
    } finally {
      setProcessing(false);
    }
  };

  const processPayment = async () => {
    if (!validationCode || validationCode.length < 6) {
      toast.error('Code de validation requis (6 chiffres)');
      return;
    }
    
    if (link.requires_amount && (!amount || parseFloat(amount) <= 0)) {
      toast.error('Montant invalide');
      return;
    }
    
    setProcessing(true);
    try {
      let res;
      if (link.link_type === 'receive') {
        res = await API.post(`/ecommerce-links/${linkCode}/receive`, {
          sender_phone: senderPhone,
          amount: link.requires_amount ? parseFloat(amount) : null,
          validation_code: validationCode
        });
      } else {
        res = await API.post(`/ecommerce-links/${linkCode}/send`, {
          receiver_phone: receiverPhone,
          amount: link.requires_amount ? parseFloat(amount) : null,
          validation_code: validationCode
        });
      }
      
      setTxResult(res.data);
      setSuccess(true);
      toast.success('Transaction effectuée avec succès !');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de transaction');
    } finally {
      setProcessing(false);
    }
  };

  const goToNextStep = () => {
    if (step === 1) {
      const phone = link.link_type === 'receive' ? senderPhone : receiverPhone;
      if (!phone || phone.length < 8) {
        toast.error('Numéro de téléphone invalide');
        return;
      }
      
      if (link.requires_amount) {
        setStep(2);
      } else {
        requestCode();
      }
    } else if (step === 2) {
      if (!amount || parseFloat(amount) <= 0) {
        toast.error('Montant invalide');
        return;
      }
      requestCode();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin text-primary">
          <Loader2 size={32} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <Link2 size={32} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Lien non valide</h1>
          <p className="text-muted-foreground">{error}</p>
          <Button className="mt-6" onClick={() => navigate('/')}>
            Retour à l'accueil
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Transaction Réussie !</h1>
          <p className="text-muted-foreground mb-4">
            {link.link_type === 'receive' 
              ? `Paiement de ${CURRENCY_SYMBOLS[txResult.currency]}${txResult.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} effectué`
              : `Envoi de ${CURRENCY_SYMBOLS[txResult.currency]}${txResult.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} effectué`
            }
          </p>
          <div className="bg-secondary rounded-lg p-4 text-left text-sm">
            <p><span className="text-muted-foreground">ID Transaction:</span> <span className="font-mono text-xs">{txResult.transaction_id}</span></p>
            <p className="mt-2"><span className="text-muted-foreground">Montant:</span> {CURRENCY_SYMBOLS[txResult.currency]}{txResult.amount.toFixed(2)}</p>
            <p><span className="text-muted-foreground">Frais:</span> {CURRENCY_SYMBOLS[txResult.currency]}{txResult.fee.toFixed(2)}</p>
            <p><span className="text-muted-foreground">Total débité:</span> {CURRENCY_SYMBOLS[txResult.currency]}{txResult.total_debited.toFixed(2)}</p>
          </div>
          <Button className="mt-6" onClick={() => window.close()}>
            Fermer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-6">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${
            link.link_type === 'receive' ? 'bg-green-500/10' : 'bg-blue-500/10'
          }`}>
            {link.link_type === 'receive' 
              ? <ArrowDownLeft size={28} className="text-green-400" />
              : <ArrowUpRight size={28} className="text-blue-400" />
            }
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {link.link_type === 'receive' ? 'Paiement E-commerce' : 'Recevoir un Paiement'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
          <p className="text-xs text-muted-foreground mt-1">par {link.creator_name}</p>
        </div>

        {/* Amount Display */}
        {link.fixed_amount && (
          <div className="text-center mb-6">
            <p className="text-3xl font-bold text-primary">
              {CURRENCY_SYMBOLS[link.currency]}{link.fixed_amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
          }`}>1</div>
          <div className={`h-0.5 w-8 ${step >= 2 || (step === 1 && !link.requires_amount) ? 'bg-primary' : 'bg-border'}`}></div>
          {link.requires_amount && (
            <>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>2</div>
              <div className={`h-0.5 w-8 ${step >= 3 ? 'bg-primary' : 'bg-border'}`}></div>
            </>
          )}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
          }`}>{link.requires_amount ? '3' : '2'}</div>
        </div>

        {/* Step 1: Phone Number */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <Phone size={14} />
                {link.link_type === 'receive' ? 'Votre numéro de téléphone' : 'Numéro du bénéficiaire'}
              </label>
              <Input
                type="tel"
                placeholder="+243..."
                value={link.link_type === 'receive' ? senderPhone : receiverPhone}
                onChange={(e) => link.link_type === 'receive' 
                  ? setSenderPhone(e.target.value) 
                  : setReceiverPhone(e.target.value)
                }
                className="mt-1"
                data-testid="phone-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {link.link_type === 'receive' 
                  ? 'Ce numéro doit être enregistré sur Monity'
                  : 'Le bénéficiaire doit avoir un compte Monity'
                }
              </p>
            </div>
            <Button className="w-full" onClick={goToNextStep} data-testid="next-btn">
              Continuer
            </Button>
          </div>
        )}

        {/* Step 2: Amount (for permanent links) */}
        {step === 2 && link.requires_amount && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <DollarSign size={14} />
                Montant ({link.currency})
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                data-testid="amount-input"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button className="flex-1" onClick={goToNextStep} disabled={processing}>
                {processing ? <Loader2 className="animate-spin" size={16} /> : 'Continuer'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Validation Code */}
        {step === 3 && codeSent && (
          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-foreground font-medium mb-1">
                <Shield size={14} className="text-primary" />
                Code de validation envoyé
              </div>
              <p className="text-xs text-muted-foreground">
                Un code à 6 chiffres a été envoyé dans le compte Monity 
                {link.link_type === 'receive' ? " du payeur" : " du propriétaire du lien"}.
                Ce code expire dans 10 minutes.
              </p>
            </div>
            
            <div>
              <label className="text-sm text-muted-foreground">Code de validation</label>
              <Input
                type="text"
                placeholder="000000"
                maxLength={6}
                value={validationCode}
                onChange={(e) => setValidationCode(e.target.value.replace(/\D/g, ''))}
                className="mt-1 text-center text-2xl font-mono tracking-widest"
                data-testid="code-input"
              />
            </div>

            {link.requires_amount && (
              <div className="bg-secondary rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Montant: <span className="text-foreground font-medium">{CURRENCY_SYMBOLS[link.currency]}{parseFloat(amount).toFixed(2)}</span></p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(link.requires_amount ? 2 : 1)}>
                Retour
              </Button>
              <Button className="flex-1" onClick={processPayment} disabled={processing}>
                {processing ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <>
                    <Send size={16} className="mr-2" />
                    Confirmer
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Transaction sécurisée par <span className="text-primary font-medium">Monity World</span>
          </p>
        </div>
      </div>
    </div>
  );
}
