import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Building2, Phone, Lock, Eye, EyeOff } from 'lucide-react';

export default function PartnerLogin() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!phone || !password) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    
    setLoading(true);
    try {
      const res = await API.post('/partner/login', { phone, password });
      localStorage.setItem('monity_token', res.data.token);
      localStorage.setItem('partner', JSON.stringify(res.data.partner));
      toast.success('Connexion réussie');
      navigate('/partner');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 size={32} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Partner Portal
          </h1>
          <p className="text-muted-foreground mt-1">Monity World</p>
        </div>

        {/* Login Form */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Téléphone</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+243..."
                  className="pl-10"
                  data-testid="partner-login-phone"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Mot de passe</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  data-testid="partner-login-password"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full btn-primary-glow" 
              disabled={loading}
              data-testid="partner-login-submit"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Contactez votre gestionnaire pour créer un compte partenaire
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © Monity World 2024 • Partner Portal
        </p>
      </div>
    </div>
  );
}
