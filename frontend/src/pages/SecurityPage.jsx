import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  Shield, Lock, Smartphone, CreditCard, RefreshCw, 
  Check, X, AlertTriangle, Eye, EyeOff, ChevronRight,
  Wallet, ArrowDownToLine, ArrowUpFromLine
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$', KES: 'KSh', UGX: 'USh', TZS: 'TSh', RWF: 'FRw' };

const PROVIDER_NAMES = {
  mtn_momo: 'MTN Mobile Money',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
  mpesa: 'M-Pesa',
  wave: 'Wave'
};

const PROVIDER_COLORS = {
  mtn_momo: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  orange_money: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  airtel_money: 'bg-red-500/10 text-red-400 border-red-500/30',
  mpesa: 'bg-green-500/10 text-green-400 border-green-500/30',
  wave: 'bg-blue-500/10 text-blue-400 border-blue-500/30'
};

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('pin'); // 'pin' | 'mobile_money' | '2fa'
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState(null);
  const [wallets, setWallets] = useState([]);
  
  // PIN states
  const [hasPIN, setHasPIN] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const [pinMode, setPinMode] = useState('set'); // 'set' | 'change' | 'verify'
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // 2FA states
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [toggling2FA, setToggling2FA] = useState(false);

  // Mobile Money states
  const [showMoMoModal, setShowMoMoModal] = useState(false);
  const [momoMode, setMomoMode] = useState('recharge'); // 'recharge' | 'withdraw'
  const [selectedProvider, setSelectedProvider] = useState('');
  const [momoAmount, setMomoAmount] = useState('');
  const [momoCurrency, setMomoCurrency] = useState('USD');
  const [momoPhone, setMomoPhone] = useState('');
  const [withdrawPin, setWithdrawPin] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [providersRes, walletsRes] = await Promise.all([
        API.get(`/integrations/providers/${user?.country || 'CD'}`),
        API.get('/wallet/wallets')
      ]);
      setProviders(providersRes.data);
      setWallets(walletsRes.data || []);
      if (providersRes.data?.mobile_money_providers?.length > 0) {
        setSelectedProvider(providersRes.data.mobile_money_providers[0]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
    setHasPIN(!!user?.transaction_pin);
    setTwoFactorEnabled(!!user?.two_factor_enabled);
    setMomoPhone(user?.phone || '');
  }, [user, fetchData]);

  // 2FA Toggle Function
  const toggle2FA = async () => {
    setToggling2FA(true);
    try {
      const newStatus = !twoFactorEnabled;
      await API.post('/auth/toggle-2fa', { enable: newStatus });
      setTwoFactorEnabled(newStatus);
      await refreshUser();
      toast.success(newStatus ? 'Double authentification activée' : 'Double authentification désactivée');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setToggling2FA(false);
    }
  };

  // PIN Functions
  const handleSetPIN = async () => {
    if (pin.length < 4 || pin.length > 6) {
      toast.error('Le PIN doit contenir 4 à 6 chiffres');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('Les PINs ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      await API.post('/pin/set', { pin });
      toast.success('PIN défini avec succès !');
      setHasPIN(true);
      setShowPINModal(false);
      resetPinForm();
      if (refreshUser) refreshUser();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePIN = async () => {
    if (newPin.length < 4 || newPin.length > 6) {
      toast.error('Le nouveau PIN doit contenir 4 à 6 chiffres');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('Les PINs ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      await API.post('/pin/change', { current_pin: currentPin, new_pin: newPin });
      toast.success('PIN modifié avec succès !');
      setShowPINModal(false);
      resetPinForm();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPIN = async () => {
    setLoading(true);
    try {
      const res = await API.post('/pin/reset');
      if (res.data.otp) {
        toast.success(`Code de réinitialisation: ${res.data.otp}`);
      } else {
        toast.success('Code envoyé par SMS');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const resetPinForm = () => {
    setPin('');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
  };

  // Mobile Money Functions
  const handleMoMoRecharge = async () => {
    if (!momoAmount || parseFloat(momoAmount) <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (!selectedProvider) {
      toast.error('Sélectionnez un fournisseur');
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/mobile-money/recharge', {
        amount: parseFloat(momoAmount),
        currency: momoCurrency,
        phone: momoPhone,
        provider: selectedProvider
      });
      toast.success(res.data.message);
      setShowMoMoModal(false);
      resetMoMoForm();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleMoMoWithdraw = async () => {
    if (!momoAmount || parseFloat(momoAmount) <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (!withdrawPin) {
      toast.error('PIN requis pour le retrait');
      return;
    }
    if (!selectedProvider) {
      toast.error('Sélectionnez un fournisseur');
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/mobile-money/withdraw', {
        amount: parseFloat(momoAmount),
        currency: momoCurrency,
        phone: momoPhone,
        provider: selectedProvider,
        pin: withdrawPin
      });
      toast.success(res.data.message);
      setShowMoMoModal(false);
      resetMoMoForm();
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const resetMoMoForm = () => {
    setMomoAmount('');
    setWithdrawPin('');
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Sécurité & Paiements</h1>
        <p className="text-sm text-muted-foreground">Gérez votre PIN et vos moyens de paiement</p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-secondary/50 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('pin')}
          className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'pin' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="pin-tab"
        >
          <Lock size={16} />
          PIN
        </button>
        <button
          onClick={() => setActiveTab('2fa')}
          className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === '2fa' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="2fa-tab"
        >
          <Shield size={16} />
          Double Auth
        </button>
        <button
          onClick={() => setActiveTab('mobile_money')}
          className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'mobile_money' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="momo-tab"
        >
          <Smartphone size={16} />
          Mobile Money
        </button>
      </div>

      {/* 2FA Section */}
      {activeTab === '2fa' && (
        <div className="space-y-4 animate-fade-in-up">
          <div className={`bg-card border rounded-2xl p-6 ${twoFactorEnabled ? 'border-green-500/30' : 'border-border'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${twoFactorEnabled ? 'bg-green-500/10' : 'bg-secondary'}`}>
                <Shield size={24} className={twoFactorEnabled ? 'text-green-400' : 'text-muted-foreground'} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  Double authentification (2FA)
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {twoFactorEnabled 
                    ? 'Votre compte est protégé par la double authentification. Un code OTP sera envoyé via WhatsApp à chaque connexion.' 
                    : 'Activez la double authentification pour une sécurité renforcée. Un code OTP sera requis à chaque connexion.'}
                </p>
                
                <div className="mt-4 p-4 bg-secondary/50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${twoFactorEnabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <span className="text-sm font-medium text-foreground">
                        {twoFactorEnabled ? 'Activée' : 'Désactivée'}
                      </span>
                    </div>
                    <Button 
                      size="sm"
                      variant={twoFactorEnabled ? 'outline' : 'default'}
                      onClick={toggle2FA}
                      disabled={toggling2FA}
                      data-testid="toggle-2fa-btn"
                    >
                      {toggling2FA ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : twoFactorEnabled ? (
                        <>
                          <X size={14} className="mr-1" />
                          Désactiver
                        </>
                      ) : (
                        <>
                          <Check size={14} className="mr-1" />
                          Activer
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* How it works */}
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comment ça fonctionne</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0">1</span>
                      <span>Vous entrez vos identifiants de connexion</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0">2</span>
                      <span>Un code OTP à 6 chiffres est envoyé via WhatsApp</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0">3</span>
                      <span>Entrez le code pour confirmer votre identité</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Tips */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <h4 className="font-medium text-blue-400 text-sm mb-2">Conseils de sécurité</h4>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Ne partagez jamais vos codes OTP avec qui que ce soit</li>
              <li>• Monity World ne vous demandera jamais votre code par téléphone</li>
              <li>• Vérifiez toujours l'expéditeur des messages WhatsApp</li>
              <li>• Signalez immédiatement toute activité suspecte</li>
            </ul>
          </div>
        </div>
      )}

      {/* PIN Section */}
      {activeTab === 'pin' && (
        <div className="space-y-4 animate-fade-in-up">
          {/* PIN Status Card */}
          <div className={`bg-card border rounded-2xl p-6 ${hasPIN ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${hasPIN ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                {hasPIN ? <Shield size={24} className="text-green-400" /> : <AlertTriangle size={24} className="text-yellow-400" />}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  {hasPIN ? 'PIN de transaction actif' : 'PIN non configuré'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasPIN 
                    ? 'Votre compte est protégé. Le PIN est requis pour les transferts et retraits.' 
                    : 'Définissez un PIN pour sécuriser vos transactions.'}
                </p>
                <div className="flex gap-2 mt-4">
                  {hasPIN ? (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => { setPinMode('change'); setShowPINModal(true); }}
                        data-testid="change-pin-btn"
                      >
                        <RefreshCw size={14} className="mr-1" />
                        Modifier
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={handleResetPIN}
                        className="text-muted-foreground"
                      >
                        PIN oublié ?
                      </Button>
                    </>
                  ) : (
                    <Button 
                      onClick={() => { setPinMode('set'); setShowPINModal(true); }}
                      data-testid="set-pin-btn"
                    >
                      <Lock size={14} className="mr-1" />
                      Définir mon PIN
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* PIN Info */}
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-medium text-foreground">À propos du PIN de transaction</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                <span>Protège vos transferts et retraits</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                <span>4 à 6 chiffres, différent de votre mot de passe</span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                <span>5 tentatives maximum avant verrouillage temporaire</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Mobile Money Section */}
      {activeTab === 'mobile_money' && (
        <div className="space-y-4 animate-fade-in-up">
          {/* Available Providers */}
          {providers && providers.mobile_money_providers?.length > 0 ? (
            <>
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground mb-4">Fournisseurs disponibles</h3>
                <div className="grid grid-cols-2 gap-3">
                  {providers.mobile_money_providers.map(provider => (
                    <button
                      key={provider}
                      onClick={() => setSelectedProvider(provider)}
                      className={`p-4 rounded-xl border transition-all ${
                        selectedProvider === provider 
                          ? `${PROVIDER_COLORS[provider]} border-2` 
                          : 'bg-secondary/50 border-border hover:border-primary/30'
                      }`}
                      data-testid={`provider-${provider}`}
                    >
                      <Smartphone size={20} className={selectedProvider === provider ? '' : 'text-muted-foreground'} />
                      <p className="text-sm font-medium mt-2">{PROVIDER_NAMES[provider]}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setMomoMode('recharge'); setShowMoMoModal(true); }}
                  className="bg-card border border-border rounded-xl p-5 hover:border-green-500/30 transition-colors text-left"
                  data-testid="recharge-btn"
                >
                  <ArrowDownToLine size={24} className="text-green-400" />
                  <h4 className="font-semibold text-foreground mt-3">Recharger</h4>
                  <p className="text-xs text-muted-foreground mt-1">Ajouter de l'argent depuis Mobile Money</p>
                </button>
                <button
                  onClick={() => { setMomoMode('withdraw'); setShowMoMoModal(true); }}
                  className="bg-card border border-border rounded-xl p-5 hover:border-blue-500/30 transition-colors text-left"
                  data-testid="withdraw-btn"
                >
                  <ArrowUpFromLine size={24} className="text-blue-400" />
                  <h4 className="font-semibold text-foreground mt-3">Retirer</h4>
                  <p className="text-xs text-muted-foreground mt-1">Envoyer vers Mobile Money</p>
                </button>
              </div>

              {/* Wallet Balance */}
              {wallets.length > 0 && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">Vos soldes</h4>
                  <div className="space-y-2">
                    {wallets.map(w => (
                      <div key={w.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{w.currency}</span>
                        <span className="font-medium text-foreground">
                          {CURRENCY_SYMBOLS[w.currency]}{w.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-8 text-center">
              <Smartphone size={48} className="mx-auto text-muted-foreground opacity-50 mb-3" />
              <h3 className="font-semibold text-foreground">Aucun fournisseur disponible</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Mobile Money n'est pas encore disponible dans votre pays ({user?.country || 'N/A'})
              </p>
            </div>
          )}
        </div>
      )}

      {/* PIN Modal */}
      {showPINModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm animate-fade-in-up" data-testid="pin-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">
                {pinMode === 'set' ? 'Définir votre PIN' : 'Modifier votre PIN'}
              </h3>
              <button onClick={() => { setShowPINModal(false); resetPinForm(); }} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {pinMode === 'change' && (
                <div>
                  <Label className="text-xs text-muted-foreground">PIN actuel</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showPin ? 'text' : 'password'}
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••"
                      className="text-center text-2xl tracking-widest"
                      maxLength={6}
                      data-testid="current-pin-input"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">
                  {pinMode === 'change' ? 'Nouveau PIN' : 'PIN (4-6 chiffres)'}
                </Label>
                <div className="relative mt-1">
                  <Input
                    type={showPin ? 'text' : 'password'}
                    value={pinMode === 'change' ? newPin : pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      pinMode === 'change' ? setNewPin(val) : setPin(val);
                    }}
                    placeholder="••••"
                    className="text-center text-2xl tracking-widest"
                    maxLength={6}
                    data-testid="new-pin-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Confirmer le PIN</Label>
                <Input
                  type={showPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="text-center text-2xl tracking-widest mt-1"
                  maxLength={6}
                  data-testid="confirm-pin-input"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowPINModal(false); resetPinForm(); }}>
                  Annuler
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={pinMode === 'change' ? handleChangePIN : handleSetPIN}
                  disabled={loading}
                  data-testid="confirm-pin-btn"
                >
                  {loading ? 'Chargement...' : 'Confirmer'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Money Modal */}
      {showMoMoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up" data-testid="momo-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">
                {momoMode === 'recharge' ? 'Recharger via Mobile Money' : 'Retirer vers Mobile Money'}
              </h3>
              <button onClick={() => { setShowMoMoModal(false); resetMoMoForm(); }} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Provider Selection */}
              <div>
                <Label className="text-xs text-muted-foreground">Fournisseur</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {providers?.mobile_money_providers?.map(provider => (
                    <button
                      key={provider}
                      onClick={() => setSelectedProvider(provider)}
                      className={`p-3 rounded-lg border text-sm transition-all ${
                        selectedProvider === provider 
                          ? `${PROVIDER_COLORS[provider]} border-2` 
                          : 'bg-secondary/50 border-border'
                      }`}
                    >
                      {PROVIDER_NAMES[provider]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <Label className="text-xs text-muted-foreground">Montant</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    value={momoAmount}
                    onChange={(e) => setMomoAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1"
                    data-testid="momo-amount"
                  />
                  <select
                    value={momoCurrency}
                    onChange={(e) => setMomoCurrency(e.target.value)}
                    className="bg-secondary border border-border rounded-lg px-3"
                  >
                    {wallets.map(w => (
                      <option key={w.currency} value={w.currency}>{w.currency}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone */}
              <div>
                <Label className="text-xs text-muted-foreground">Numéro Mobile Money</Label>
                <Input
                  value={momoPhone}
                  onChange={(e) => setMomoPhone(e.target.value)}
                  placeholder="+243..."
                  className="mt-1"
                  data-testid="momo-phone"
                />
              </div>

              {/* PIN for withdrawal */}
              {momoMode === 'withdraw' && (
                <div>
                  <Label className="text-xs text-muted-foreground">PIN de transaction</Label>
                  <Input
                    type="password"
                    value={withdrawPin}
                    onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••"
                    className="mt-1 text-center tracking-widest"
                    maxLength={6}
                    data-testid="momo-pin"
                  />
                </div>
              )}

              {/* Summary */}
              {momoAmount && parseFloat(momoAmount) > 0 && (
                <div className="bg-secondary/50 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Montant</span>
                    <span className="text-foreground">{CURRENCY_SYMBOLS[momoCurrency]}{parseFloat(momoAmount).toFixed(2)}</span>
                  </div>
                  {momoMode === 'withdraw' && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-muted-foreground">Frais (1.5%)</span>
                      <span className="text-foreground">{CURRENCY_SYMBOLS[momoCurrency]}{(parseFloat(momoAmount) * 0.015).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowMoMoModal(false); resetMoMoForm(); }}>
                  Annuler
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={momoMode === 'recharge' ? handleMoMoRecharge : handleMoMoWithdraw}
                  disabled={loading || !momoAmount || !selectedProvider}
                  data-testid="confirm-momo-btn"
                >
                  {loading ? 'Chargement...' : (momoMode === 'recharge' ? 'Recharger' : 'Retirer')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
