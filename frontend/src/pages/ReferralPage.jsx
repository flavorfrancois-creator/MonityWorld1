import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Gift, Copy, Share2, Users, DollarSign, Clock, CheckCircle2, TrendingUp } from 'lucide-react';

export default function ReferralPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/referral/stats').then(res => setStats(res.data)).catch(() => toast.error('Erreur')).finally(() => setLoading(false));
  }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(user?.referral_code || '');
    toast.success('Code copié !');
  };

  const shareCode = () => {
    const text = `Rejoins Monity World avec mon code : ${user?.referral_code} et reçois $5 de bonus ! 💰`;
    if (navigator.share) {
      navigator.share({ title: 'Monity World', text });
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Message copié !');
    }
  };

  if (loading) return <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}</div>;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Parrainage</h2>
        <p className="text-sm text-muted-foreground mt-1">Invitez vos amis et gagnez $5 par parrainage</p>
      </div>

      {/* Referral Code Card */}
      <div className="balance-card rounded-2xl p-6 animate-fade-in-up stagger-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Gift size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Votre code de parrainage</p>
            <p className="text-xs text-muted-foreground">Partagez-le pour gagner des récompenses</p>
          </div>
        </div>
        <div className="bg-secondary/50 rounded-xl p-4 flex items-center justify-between mb-4">
          <span className="text-2xl font-bold text-primary tracking-widest font-mono" data-testid="referral-code">{user?.referral_code}</span>
          <button onClick={copyCode} className="w-9 h-9 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors" data-testid="copy-code-btn">
            <Copy size={16} className="text-primary" />
          </button>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-2" onClick={copyCode} data-testid="copy-code-action-btn">
            <Copy size={14} />Copier
          </Button>
          <Button className="flex-1 gap-2 btn-primary-glow" onClick={shareCode} data-testid="share-code-btn">
            <Share2 size={14} />Partager
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in-up stagger-2">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Users size={18} className="text-blue-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}} data-testid="total-referrals">{stats?.total_referrals || 0}</p>
          <p className="text-xs text-muted-foreground">Filleuls</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <DollarSign size={18} className="text-green-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}} data-testid="total-earned">${stats?.total_earned?.toFixed(2) || '0.00'}</p>
          <p className="text-xs text-muted-foreground">Gagné</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Clock size={18} className="text-yellow-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>${stats?.pending_rewards?.toFixed(2) || '0.00'}</p>
          <p className="text-xs text-muted-foreground">En attente</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-card border border-border rounded-xl p-5 animate-fade-in-up stagger-3">
        <h3 className="font-semibold text-foreground mb-4" style={{fontFamily:'Manrope'}}>Comment ça fonctionne ?</h3>
        <div className="space-y-4">
          {[
            { icon: Share2, color: 'text-blue-400 bg-blue-500/10', title: 'Partagez votre code', desc: 'Envoyez votre code unique à vos amis et famille' },
            { icon: Users, color: 'text-purple-400 bg-purple-500/10', title: 'Ils s\'inscrivent', desc: 'Votre filleul crée son compte avec votre code' },
            { icon: CheckCircle2, color: 'text-green-400 bg-green-500/10', title: 'Ils effectuent une transaction', desc: 'Après sa première transaction validée' },
            { icon: TrendingUp, color: 'text-yellow-400 bg-yellow-500/10', title: 'Vous gagnez $5', desc: 'La récompense est créditée sur votre portefeuille' },
          ].map(({ icon: Icon, color, title, desc }, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Referrals List */}
      {stats?.referrals?.length > 0 && (
        <div className="animate-fade-in-up stagger-4">
          <h3 className="font-semibold text-foreground mb-3">Mes filleuls</h3>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {stats.referrals.map((r, i) => (
              <div key={r.id} className={`flex items-center justify-between px-4 py-3 ${i < stats.referrals.length - 1 ? 'border-b border-border' : ''}`} data-testid={`referral-${i}`}>
                <div>
                  <p className="text-sm text-foreground font-medium">Filleul #{i+1}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">${r.reward_amount}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'paid' ? 'badge-completed' : 'badge-pending'}`}>{r.status === 'paid' ? 'Payé' : 'En attente'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
