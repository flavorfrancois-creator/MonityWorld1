import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Link2, Lock, CheckCircle, XCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

export default function PayLink() {
  const { linkCode } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [linkData, setLinkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const fetchLink = useCallback(async () => {
    try {
      const res = await API.get(`/payment-links/public/${linkCode}`);
      setLinkData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Lien invalide ou expiré');
    } finally {
      setLoading(false);
    }
  }, [linkCode]);

  useEffect(() => { fetchLink(); }, [fetchLink]);

  const handlePay = async () => {
    if (!password) {
      toast.error('Mot de passe requis');
      return;
    }
    setPaying(true);
    try {
      await API.post(`/payment-links/${linkCode}/pay`, { password });
      setPaid(true);
      toast.success('Paiement effectué !');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de paiement');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <XCircle size={32} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Lien invalide</h1>
          <p className="text-muted-foreground mt-2">{error}</p>
          <Button className="mt-6" onClick={() => navigate('/')}>
            Retour à l'accueil
          </Button>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Paiement réussi !</h1>
          <p className="text-muted-foreground mt-2">
            Vous avez payé {CURRENCY_SYMBOLS[linkData.currency]}{linkData.amount.toFixed(2)} à {linkData.creator_name}
          </p>
          <Button className="mt-6" onClick={() => navigate('/dashboard')}>
            Aller au tableau de bord
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Link2 size={32} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Demande de paiement</h1>
          <p className="text-3xl font-bold text-primary mt-4" style={{ fontFamily: 'Manrope' }}>
            {CURRENCY_SYMBOLS[linkData.currency]}{linkData.amount.toFixed(2)}
          </p>
          <p className="text-muted-foreground mt-2">{linkData.description}</p>
          <p className="text-sm text-muted-foreground mt-1">De: {linkData.creator_name}</p>
          
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mt-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-400 text-left">
              Connectez-vous pour effectuer ce paiement
            </p>
          </div>
          
          <Button className="w-full mt-4" onClick={() => navigate('/')}>
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full animate-fade-in-up" data-testid="pay-link-form">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Link2 size={32} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Demande de paiement</h1>
          <p className="text-3xl font-bold text-primary mt-4" style={{ fontFamily: 'Manrope' }}>
            {CURRENCY_SYMBOLS[linkData.currency]}{linkData.amount.toFixed(2)}
          </p>
          <p className="text-muted-foreground mt-2">{linkData.description}</p>
          <p className="text-sm text-muted-foreground mt-1">De: {linkData.creator_name}</p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="bg-secondary/50 rounded-lg p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Montant</span>
              <span className="text-foreground">{CURRENCY_SYMBOLS[linkData.currency]}{linkData.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Frais (1%)</span>
              <span className="text-foreground">{CURRENCY_SYMBOLS[linkData.currency]}{(linkData.amount * 0.01).toFixed(2)}</span>
            </div>
            <div className="border-t border-border mt-2 pt-2 flex justify-between font-semibold">
              <span className="text-foreground">Total à payer</span>
              <span className="text-primary">{CURRENCY_SYMBOLS[linkData.currency]}{(linkData.amount * 1.01).toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground flex items-center gap-2">
              <Lock size={14} />
              Mot de passe de validation
            </label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Entrez le mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="pay-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button 
            className="w-full" 
            onClick={handlePay} 
            disabled={paying || !password}
            data-testid="confirm-pay-btn"
          >
            {paying ? 'Paiement en cours...' : 'Confirmer le paiement'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Connecté en tant que {user?.name}
          </p>
        </div>
      </div>
    </div>
  );
}
