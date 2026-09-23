import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Send, Download, Plus, ArrowUpRight, ArrowDownLeft,
  RefreshCw, TrendingUp, CreditCard, Users2, PiggyBank, Eye, EyeOff, Copy, ChevronRight
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽' };

function TxBadge({ status }) {
  const map = { completed: 'badge-completed', pending: 'badge-pending', rejected: 'badge-rejected' };
  const labels = { completed: 'Complété', pending: 'En attente', rejected: 'Rejeté' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || ''}`}>{labels[status] || status}</span>;
}

function TxIcon({ type, isSender }) {
  if (type === 'recharge') return <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center"><ArrowDownLeft size={16} className="text-green-500" /></div>;
  if (type === 'withdrawal') return <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center"><ArrowUpRight size={16} className="text-orange-500" /></div>;
  return isSender
    ? <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center"><ArrowUpRight size={16} className="text-red-400" /></div>
    : <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center"><ArrowDownLeft size={16} className="text-green-500" /></div>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [savings, setSavings] = useState([]);
  const [cards, setCards] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBalance, setShowBalance] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [balRes, txRes, savRes, cardRes, grpRes] = await Promise.all([
        API.get('/wallet/balance'),
        API.get('/wallet/transactions?page=1&limit=5'),
        API.get('/savings'),
        API.get('/cards'),
        API.get('/groups'),
      ]);
      setBalance(balRes.data);
      setTransactions(txRes.data.transactions || []);
      setSavings(savRes.data || []);
      setCards(cardRes.data || []);
      setGroups(grpRes.data || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const quickActions = [
    { label: t('send'), icon: Send, color: 'bg-blue-500/10 text-blue-400', path: '/send' },
    { label: t('recharge'), icon: Plus, color: 'bg-green-500/10 text-green-400', path: '/send?tab=recharge' },
    { label: t('withdraw'), icon: Download, color: 'bg-orange-500/10 text-orange-400', path: '/send?tab=withdraw' },
    { label: t('history'), icon: RefreshCw, color: 'bg-purple-500/10 text-purple-400', path: '/history' },
  ];

  const totalSavings = savings.filter(s => s.status === 'active').reduce((sum, s) => sum + s.amount, 0);

  if (loading) return (
    <div className="p-6 space-y-4">
      {[1,2,3].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}
    </div>
  );

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="animate-fade-in-up">
        <p className="text-muted-foreground text-sm">{greeting()},</p>
        <h1 className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>{user?.name?.split(' ')[0]} 👋</h1>
      </div>

      {/* Balance Card */}
      <div className="balance-card rounded-2xl p-6 animate-fade-in-up stagger-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 pointer-events-none" />
        <div className="flex items-start justify-between mb-1">
          <p className="text-muted-foreground text-sm font-medium">{t('total_balance')}</p>
          <button onClick={() => setShowBalance(!showBalance)} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-balance-btn">
            {showBalance ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {showBalance ? (
          <div>
            <h2 className="text-4xl font-bold text-foreground mt-1" style={{fontFamily:'Manrope'}} data-testid="total-balance">
              <span className="text-primary">{CURRENCY_SYMBOLS[balance?.primary_currency] || '$'}</span>
              {balance?.primary_balance?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">≈ ${balance?.total_usd?.toFixed(2)} USD total</p>
          </div>
        ) : (
          <div className="text-4xl font-bold text-foreground mt-1" style={{fontFamily:'Manrope'}}>•••••••</div>
        )}

        {/* Wallets mini */}
        {balance?.wallets && balance.wallets.length > 1 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {balance.wallets.map(w => (
              <div key={w.id} className="bg-secondary/50 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{w.currency}</span>
                <span className="text-xs font-semibold text-foreground">
                  {showBalance ? `${CURRENCY_SYMBOLS[w.currency] || ''}${w.balance.toLocaleString('fr-FR')}` : '•••'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Account number */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">N° Compte:</span>
          <span className="text-xs font-mono text-foreground">{user?.account_number}</span>
          <button onClick={() => { navigator.clipboard.writeText(user?.account_number); toast.success('Copié !'); }}
            className="text-muted-foreground hover:text-primary transition-colors" data-testid="copy-account-btn">
            <Copy size={12} />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3 animate-fade-in-up stagger-2">
        {quickActions.map(({ label, icon: Icon, color, path }) => (
          <button key={label} onClick={() => navigate(path)}
            className={`quick-action flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/30`}
            data-testid={`quick-action-${label.toLowerCase()}`}>
            <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
              <Icon size={18} />
            </div>
            <span className="text-xs font-medium text-foreground text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Bento Grid Stats */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in-up stagger-3">
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate('/savings')}>
          <div className="flex items-center gap-2 mb-1">
            <PiggyBank size={16} className="text-primary" />
            <span className="text-xs text-muted-foreground">Épargne</span>
          </div>
          <p className="text-lg font-bold text-foreground" style={{fontFamily:'Manrope'}}>{savings.filter(s => s.status === 'active').length}</p>
          <p className="text-xs text-muted-foreground">${totalSavings.toFixed(0)} USD</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate('/wallet')}>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard size={16} className="text-blue-400" />
            <span className="text-xs text-muted-foreground">Cartes</span>
          </div>
          <p className="text-lg font-bold text-foreground" style={{fontFamily:'Manrope'}}>{cards.length}</p>
          <p className="text-xs text-muted-foreground">virtuelles</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate('/cotisation')}>
          <div className="flex items-center gap-2 mb-1">
            <Users2 size={16} className="text-purple-400" />
            <span className="text-xs text-muted-foreground">Groupes</span>
          </div>
          <p className="text-lg font-bold text-foreground" style={{fontFamily:'Manrope'}}>{groups.length}</p>
          <p className="text-xs text-muted-foreground">cotisation</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="animate-fade-in-up stagger-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>{t('recent_tx')}</h3>
          <button onClick={() => navigate('/history')} className="text-xs text-primary hover:underline flex items-center gap-1">
            Voir tout <ChevronRight size={12} />
          </button>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <TrendingUp size={32} className="text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground text-sm">{t('no_tx')}</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="recent-transactions">
            {transactions.map((tx, i) => {
              const isSender = tx.sender_id === user?.id;
              const name = isSender ? tx.receiver_name : tx.sender_name;
              const sign = tx.type === 'recharge' ? '+' : isSender ? '-' : '+';
              const amtColor = sign === '+' ? 'text-green-400' : 'text-foreground';
              return (
                <div key={tx.id} className={`tx-item flex items-center gap-3 px-4 py-3 ${i < transactions.length - 1 ? 'border-b border-border' : ''}`} data-testid={`tx-item-${i}`}>
                  <TxIcon type={tx.type} isSender={isSender} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{name || tx.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${amtColor}`}>{sign}{tx.amount} {tx.currency}</p>
                    <TxBadge status={tx.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* KYC Warning */}
      {user?.kyc_status === 'pending' && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center gap-3 animate-fade-in-up">
          <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={16} className="text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-400">Vérification KYC requise</p>
            <p className="text-xs text-muted-foreground">Vérifiez votre identité pour débloquer toutes les fonctionnalités</p>
          </div>
          <Button size="sm" variant="outline" className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10" onClick={() => navigate('/profile')}>
            Compléter
          </Button>
        </div>
      )}
    </div>
  );
}

function ShieldCheck({ size, className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
    </svg>
  );
}
