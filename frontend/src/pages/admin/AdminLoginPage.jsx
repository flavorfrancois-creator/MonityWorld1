import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Eye, EyeOff, Shield, Lock, Mail, Phone, ArrowLeft, AlertTriangle } from 'lucide-react';

export default function AdminLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginData, setLoginData] = useState({ identifier: '', password: '' });
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFAOtp, setTwoFAOtp] = useState('');
  const [pendingLoginData, setPendingLoginData] = useState(null);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState(false);

  // Check for session expired flag on mount
  useEffect(() => {
    const sessionExpired = localStorage.getItem('monity_session_expired');
    if (sessionExpired) {
      localStorage.removeItem('monity_session_expired');
      setSessionExpiredMsg(true);
      toast.error('Session expirée. Un autre appareil s\'est connecté à votre compte.');
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginData.identifier || !loginData.password) {
      toast.error('Remplissez tous les champs');
      return;
    }
    setLoading(true);
    try {
      const identifier = loginData.identifier.trim();
      const isEmail = identifier.includes('@');
      const payload = isEmail
        ? { email: identifier, password: loginData.password }
        : { phone: identifier, password: loginData.password };

      const res = await API.post('/auth/admin/login', payload);

      if (res.data.requires_2fa) {
        setPendingLoginData(res.data);
        setShow2FAModal(true);
        toast.info('Un code OTP a été envoyé via WhatsApp');
      } else {
        login(res.data.token, res.data.user);
        toast.success('Connexion réussie !');
        navigate('/admin');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
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
        otp: twoFAOtp,
      });
      login(res.data.token, res.data.user);
      toast.success('Connexion réussie !');
      setShow2FAModal(false);
      navigate('/admin');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Code OTP incorrect');
    } finally {
      setLoading(false);
    }
  };

  if (show2FAModal) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-600/5 rounded-full blur-3xl" />
        </div>
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <Shield size={32} className="text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Vérification 2FA</h1>
            <p className="text-zinc-400 text-sm mt-1">Un code a été envoyé via WhatsApp</p>
          </div>
          <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-zinc-400">Code OTP</Label>
              <Input
                data-testid="admin-2fa-otp-input"
                value={twoFAOtp}
                onChange={(e) => setTwoFAOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="bg-zinc-800/50 border-zinc-700 text-white text-center text-2xl tracking-[0.5em] h-14"
                maxLength={6}
              />
            </div>
            <Button
              data-testid="admin-2fa-submit-btn"
              onClick={handleVerify2FA}
              disabled={loading || twoFAOtp.length !== 6}
              className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {loading ? 'Vérification...' : 'Vérifier'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-600/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8" data-testid="admin-login-header">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/logo-monity.png"
              alt="Monity World"
              className="h-20 w-auto object-contain"
            />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield size={20} className="text-amber-400" />
            <span className="text-amber-400 text-xs font-semibold uppercase tracking-widest">
              Espace Administration
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Manrope' }}>
            Connexion Administrateur
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Accès réservé aux administrateurs et gestionnaires
          </p>
        </div>

        {/* Session Expired Warning */}
        {sessionExpiredMsg && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4" data-testid="session-expired-warning">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Session expirée</p>
                <p className="text-xs text-zinc-400">Un autre appareil s'est connecté à votre compte. Veuillez vous reconnecter.</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm text-zinc-400 flex items-center gap-2">
                <Mail size={14} />
                Email ou Téléphone
              </Label>
              <Input
                data-testid="admin-login-identifier-input"
                value={loginData.identifier}
                onChange={(e) => setLoginData({ ...loginData, identifier: e.target.value })}
                placeholder="admin@monityworld.com ou +243..."
                className="bg-zinc-800/50 border-zinc-700 text-white h-12 focus:border-amber-500/50"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-zinc-400 flex items-center gap-2">
                <Lock size={14} />
                Mot de passe
              </Label>
              <div className="relative">
                <Input
                  data-testid="admin-login-password-input"
                  type={showPwd ? 'text' : 'password'}
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  placeholder="Votre mot de passe"
                  className="bg-zinc-800/50 border-zinc-700 text-white h-12 pr-12 focus:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              data-testid="admin-login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-base"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connexion...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield size={18} />
                  Se connecter
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-zinc-800">
            <button
              data-testid="admin-login-back-btn"
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mx-auto"
            >
              <ArrowLeft size={14} />
              Retour à l'espace client
            </button>
          </div>
        </div>

        <div className="mt-4 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
          <p className="text-xs text-amber-400/70 text-center">
            Cet espace est strictement réservé au personnel autorisé. Toute tentative d'accès non autorisée sera enregistrée.
          </p>
        </div>
      </div>
    </div>
  );
}
