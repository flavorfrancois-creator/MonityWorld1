import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Eye, EyeOff, Phone, Lock, User, Globe, ArrowRight, ShieldCheck, CreditCard, Mail, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react';

// Default countries (will be loaded from API)
const DEFAULT_COUNTRIES = [
  { code: 'CD', name: 'RD Congo', phone_prefix: '+243', default_currency: 'USD' },
  { code: 'CM', name: 'Cameroun', phone_prefix: '+237', default_currency: 'XAF' },
  { code: 'SN', name: 'Sénégal', phone_prefix: '+221', default_currency: 'XOF' },
  { code: 'CI', name: "Côte d'Ivoire", phone_prefix: '+225', default_currency: 'XOF' },
  { code: 'NG', name: 'Nigeria', phone_prefix: '+234', default_currency: 'NGN' },
  { code: 'GH', name: 'Ghana', phone_prefix: '+233', default_currency: 'GHS' },
  { code: 'FR', name: 'France', phone_prefix: '+33', default_currency: 'EUR' },
  { code: 'BE', name: 'Belgique', phone_prefix: '+32', default_currency: 'EUR' },
  { code: 'US', name: 'États-Unis', phone_prefix: '+1', default_currency: 'USD' },
  { code: 'GB', name: 'Royaume-Uni', phone_prefix: '+44', default_currency: 'GBP' },
  { code: 'CA', name: 'Canada', phone_prefix: '+1', default_currency: 'CAD' },
  { code: 'MA', name: 'Maroc', phone_prefix: '+212', default_currency: 'MAD' },
  { code: 'DZ', name: 'Algérie', phone_prefix: '+213', default_currency: 'DZD' },
  { code: 'TN', name: 'Tunisie', phone_prefix: '+216', default_currency: 'TND' },
  { code: 'KE', name: 'Kenya', phone_prefix: '+254', default_currency: 'KES' },
  { code: 'RW', name: 'Rwanda', phone_prefix: '+250', default_currency: 'RWF' },
];

export default function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpModal, setOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [registeredPhone, setRegisteredPhone] = useState('');
  const [countries, setCountries] = useState(DEFAULT_COUNTRIES);
  
  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  
  // 2FA OTP states for login
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFAOtp, setTwoFAOtp] = useState('');
  const [pendingLoginData, setPendingLoginData] = useState(null);

  // Login state - now supports email too
  const [loginData, setLoginData] = useState({ identifier: '', password: '', isEmail: false });
  // Register state - country first, phone prefix automatic
  const [regData, setRegData] = useState({ 
    name: '', email: '', phone: '', password: '', 
    country: 'CD', language: 'fr', referral_code: '', nfc_card_number: '' 
  });
  const [phonePrefix, setPhonePrefix] = useState('+243');
  const [showNfcField, setShowNfcField] = useState(false);

  // Load countries from API
  useEffect(() => {
    // Check if session was expired by another device
    const sessionExpired = localStorage.getItem('monity_session_expired');
    if (sessionExpired) {
      localStorage.removeItem('monity_session_expired');
      toast.error('Session expirée. Un autre appareil s\'est connecté à votre compte.');
    }
    API.get('/countries').then(res => {
      if (res.data?.countries) {
        setCountries(res.data.countries);
      }
    }).catch(() => {
      // Use defaults if API fails
    });
  }, []);

  // Update phone prefix when country changes
  const handleCountryChange = (countryCode, setter, prefixSetter) => {
    const country = countries.find(c => c.code === countryCode);
    if (country) {
      prefixSetter(country.phone_prefix);
    }
    setter(prev => ({ ...prev, country: countryCode }));
  };

  const formatCardNumber = (value) => {
    const clean = value.replace(/\D/g, '').slice(0, 16);
    const parts = [];
    for (let i = 0; i < clean.length; i += 4) {
      parts.push(clean.slice(i, i + 4));
    }
    return parts.join('-');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginData.identifier || !loginData.password) { 
      toast.error('Remplissez tous les champs'); 
      return; 
    }
    setLoading(true);
    try {
      // Determine if identifier is email or phone
      const identifier = loginData.identifier || '';
      const isEmail = identifier.includes('@');
      const payload = isEmail 
        ? { email: identifier, password: loginData.password }
        : { phone: identifier, password: loginData.password };
      
      const res = await API.post('/auth/login', payload);
      
      // Registration was never confirmed by OTP - reuse the OTP modal to finish it
      if (res.data.requires_otp_verification) {
        setRegisteredPhone(res.data.phone);
        setOtpModal(true);
        toast.info(res.data.message || 'Veuillez confirmer votre compte avec le code OTP envoyé via WhatsApp');
      } else if (res.data.requires_2fa) {
        setPendingLoginData(res.data);
        setShow2FAModal(true);
        toast.info('Un code OTP a été envoyé via WhatsApp');
      } else {
        login(res.data.token, res.data.user);
        toast.success('Connexion réussie ! Bienvenue.');
        navigate('/dashboard');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Identifiants incorrects');
    } finally { setLoading(false); }
  };

  const handleVerify2FA = async () => {
    if (!twoFAOtp || twoFAOtp.length !== 6) {
      toast.error('Entrez le code OTP à 6 chiffres');
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/auth/verify-2fa', {
        user_id: pendingLoginData.user_id,
        otp: twoFAOtp
      });
      login(res.data.token, res.data.user);
      toast.success('Connexion réussie !');
      setShow2FAModal(false);
      setTwoFAOtp('');
      setPendingLoginData(null);
      navigate('/dashboard');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Code OTP incorrect');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regData.name || !regData.phone || !regData.password) { 
      toast.error('Remplissez tous les champs obligatoires'); 
      return; 
    }
    if (regData.password.length < 6) { toast.error('Mot de passe minimum 6 caractères'); return; }
    
    // Build full phone number with prefix
    const fullPhone = regData.phone.startsWith('+') ? regData.phone : phonePrefix + regData.phone.replace(/^0+/, '');
    
    setLoading(true);
    try {
      const payload = { ...regData, phone: fullPhone };
      await API.post('/auth/register', payload);
      setRegisteredPhone(fullPhone);
      setOtpModal(true);
      toast.success('Inscription réussie ! Un code OTP a été envoyé via WhatsApp.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de l\'inscription');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otpValue || otpValue.length !== 6) { toast.error('Entrez un OTP à 6 chiffres'); return; }
    setLoading(true);
    try {
      const res = await API.post('/auth/verify-otp', { phone: registeredPhone, otp: otpValue });
      login(res.data.token, res.data.user);
      toast.success('Compte vérifié avec succès !');
      navigate('/dashboard');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'OTP incorrect');
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast.error('Entrez votre adresse email');
      return;
    }
    setLoading(true);
    try {
      await API.post('/auth/forgot-password', { email: forgotEmail });
      setForgotSent(true);
      toast.success('Lien de réinitialisation envoyé par email et WhatsApp !');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de l\'envoi');
    } finally { setLoading(false); }
  };

  const resendOtp = async () => {
    if (!registeredPhone) return;
    setLoading(true);
    try {
      await API.post('/auth/resend-otp', { phone: registeredPhone });
      toast.success('Nouveau code OTP envoyé via WhatsApp');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally { setLoading(false); }
  };

  // Forgot Password Screen
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8 animate-fade-in-up">
            <div className="flex items-center justify-center mb-4">
              <img 
                src="/logo-monity.png" 
                alt="Monity World" 
                className="h-20 w-auto object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Mot de passe oublié</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {forgotSent ? 'Vérifiez vos messages' : 'Entrez votre adresse email'}
            </p>
          </div>

          <div className="glass rounded-2xl p-6 animate-fade-in-up stagger-1">
            {forgotSent ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <CheckCircle size={32} className="text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Lien envoyé !</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Un lien de réinitialisation a été envoyé à <strong>{forgotEmail}</strong> par email et via WhatsApp.
                  </p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-blue-400">
                    Vérifiez votre boîte mail et vos messages WhatsApp. Le lien expire dans 30 minutes.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(''); }}
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Retour à la connexion
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Adresse email</Label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="pl-10 h-11"
                      data-testid="forgot-email-input"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Un lien de réinitialisation sera envoyé par email et WhatsApp
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 btn-primary-glow font-medium" 
                  disabled={loading}
                  data-testid="forgot-submit-btn"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>Envoyer le lien<ArrowRight size={16} className="ml-2" /></>
                  )}
                </Button>

                <Button 
                  type="button"
                  variant="ghost" 
                  className="w-full"
                  onClick={() => setShowForgotPassword(false)}
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Retour à la connexion
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/logo-monity.png" 
              alt="Monity World" 
              className="h-28 w-auto object-contain"
            />
          </div>
          <p className="text-muted-foreground text-sm">Votre portefeuille digital sécurisé</p>
        </div>

        {/* OTP Modal for Registration */}
        {otpModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="glass w-full max-w-sm rounded-2xl p-6 animate-fade-in-up">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground" style={{fontFamily:'Manrope'}}>Vérification OTP</h3>
                  <p className="text-xs text-muted-foreground">{registeredPhone}</p>
                </div>
              </div>
              
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-400">
                  Un code OTP à 6 chiffres a été envoyé via WhatsApp à votre numéro de téléphone.
                </p>
              </div>

              <Label className="text-sm text-muted-foreground mb-2 block">Entrez votre code OTP</Label>
              <Input
                value={otpValue}
                onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl font-bold tracking-widest h-14 mb-4"
                maxLength={6}
                data-testid="otp-input"
              />
              <div className="flex gap-3 mb-3">
                <Button variant="outline" className="flex-1" onClick={() => setOtpModal(false)} data-testid="otp-cancel-btn">Annuler</Button>
                <Button className="flex-1 btn-primary-glow" onClick={handleVerifyOtp} disabled={loading} data-testid="otp-verify-btn">
                  {loading ? 'Vérification...' : 'Vérifier'}
                </Button>
              </div>
              <button 
                type="button" 
                className="w-full text-center text-xs text-primary hover:underline"
                onClick={resendOtp}
                disabled={loading}
              >
                Renvoyer le code OTP
              </button>
            </div>
          </div>
        )}

        {/* 2FA Modal for Login */}
        {show2FAModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="glass w-full max-w-sm rounded-2xl p-6 animate-fade-in-up">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-green-400" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground" style={{fontFamily:'Manrope'}}>Double authentification</h3>
                  <p className="text-xs text-muted-foreground">Vérification de sécurité</p>
                </div>
              </div>
              
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-green-400">
                  Un code OTP à 6 chiffres a été envoyé via WhatsApp pour confirmer votre identité.
                </p>
              </div>

              <Label className="text-sm text-muted-foreground mb-2 block">Code de vérification</Label>
              <Input
                value={twoFAOtp}
                onChange={e => setTwoFAOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl font-bold tracking-widest h-14 mb-4"
                maxLength={6}
                data-testid="2fa-otp-input"
              />
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => { setShow2FAModal(false); setTwoFAOtp(''); setPendingLoginData(null); }}
                >
                  Annuler
                </Button>
                <Button 
                  className="flex-1 btn-primary-glow" 
                  onClick={handleVerify2FA} 
                  disabled={loading}
                  data-testid="2fa-verify-btn"
                >
                  {loading ? 'Vérification...' : 'Confirmer'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Auth Card */}
        <div className="glass rounded-2xl p-6 animate-fade-in-up stagger-1">
          <Tabs defaultValue="login">
            <TabsList className="w-full mb-6 bg-secondary/50 grid grid-cols-2">
              <TabsTrigger value="login" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="login-tab">
                Connexion
              </TabsTrigger>
              <TabsTrigger value="register" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="register-tab">
                Inscription
              </TabsTrigger>
            </TabsList>

            {/* LOGIN */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Téléphone ou Email</Label>
                  <div className="relative">
                    {(loginData.identifier || '').includes('@') ? (
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    ) : (
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    )}
                    <Input
                      value={loginData.identifier || ''}
                      onChange={e => setLoginData({...loginData, identifier: e.target.value})}
                      placeholder="+243... ou email@exemple.com"
                      className="pl-10 h-11"
                      data-testid="login-identifier-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Mot de passe</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showPwd ? 'text' : 'password'}
                      value={loginData.password || ''}
                      onChange={e => setLoginData({...loginData, password: e.target.value})}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-11"
                      data-testid="login-password-input"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(!showPwd)}>
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Forgot Password Link */}
                <div className="text-right">
                  <button 
                    type="button" 
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowForgotPassword(true)}
                    data-testid="forgot-password-link"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

                <Button type="submit" className="w-full h-11 btn-primary-glow font-medium" disabled={loading} data-testid="login-submit-btn">
                  {loading ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><span>Se connecter</span><ArrowRight size={16} className="ml-2" /></>}
                </Button>
              </form>
            </TabsContent>

            {/* REGISTER */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Nom complet *</Label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={regData.name} onChange={e => setRegData({...regData, name: e.target.value})} placeholder="Jean Dupont" className="pl-10 h-11" data-testid="register-name-input" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Email (optionnel)</Label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input type="email" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} placeholder="email@exemple.com" className="pl-10 h-11" data-testid="register-email-input" />
                  </div>
                  <p className="text-xs text-muted-foreground">Permet de se connecter et récupérer votre mot de passe</p>
                </div>
                
                {/* Country FIRST - then phone */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Pays *</Label>
                  <div className="relative">
                    <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
                    <Select 
                      value={regData.country} 
                      onValueChange={v => handleCountryChange(v, setRegData, setPhonePrefix)}
                    >
                      <SelectTrigger className="pl-10 h-11" data-testid="register-country-select">
                        <SelectValue placeholder="Choisissez un pays" />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map(c => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name} ({c.phone_prefix})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Phone with auto prefix */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Numéro de téléphone *</Label>
                  <div className="flex gap-2">
                    <div className="w-24 shrink-0">
                      <Input 
                        value={phonePrefix} 
                        disabled 
                        className="h-11 text-center bg-secondary/50 font-mono"
                      />
                    </div>
                    <div className="relative flex-1">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        value={regData.phone} 
                        onChange={e => setRegData({...regData, phone: e.target.value.replace(/\D/g, '')})} 
                        placeholder="XXX XXX XXX" 
                        className="pl-10 h-11" 
                        data-testid="register-phone-input" 
                      />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Mot de passe *</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input type={showPwd ? 'text' : 'password'} value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} placeholder="Min. 6 caractères" className="pl-10 pr-10 h-11" data-testid="register-password-input" />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(!showPwd)}>
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Code de parrainage (optionnel)</Label>
                  <Input value={regData.referral_code} onChange={e => setRegData({...regData, referral_code: e.target.value})} placeholder="CODE123" className="h-11" data-testid="register-referral-input" />
                </div>

                {/* NFC Card Number */}
                <div className="space-y-2">
                  <button 
                    type="button"
                    onClick={() => setShowNfcField(!showNfcField)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <CreditCard size={12} />
                    {showNfcField ? "Masquer" : "J'ai une carte NFC prépayée"}
                  </button>
                  {showNfcField && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-blue-400">Entrez le numéro à 16 chiffres imprimé sur votre carte NFC</p>
                      <div className="relative">
                        <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
                        <Input 
                          value={regData.nfc_card_number} 
                          onChange={e => setRegData({...regData, nfc_card_number: formatCardNumber(e.target.value)})} 
                          placeholder="8552-9657-5431-4523" 
                          className="pl-10 h-11 font-mono text-center tracking-wider"
                          maxLength={19}
                          data-testid="register-nfc-card-input" 
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Cette carte deviendra votre carte principale</p>
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full h-11 btn-primary-glow font-medium" disabled={loading} data-testid="register-submit-btn">
                  {loading ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><span>Créer mon compte</span><ArrowRight size={16} className="ml-2" /></>}
                </Button>
              </form>
            </TabsContent>

          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Sécurisé par chiffrement bout en bout · Monity World © 2024
        </p>

        <div className="text-center mt-3">
          <button
            data-testid="client-to-admin-login-btn"
            onClick={() => navigate('/admin/login')}
            className="text-xs text-zinc-500 hover:text-amber-400 transition-colors"
          >
            Espace administrateur
          </button>
        </div>
      </div>
    </div>
  );
}
