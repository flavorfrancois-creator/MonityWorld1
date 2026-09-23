import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { 
  Wallet, TrendingUp, Users, CreditCard, ArrowUpRight, ArrowDownRight,
  Building2, RefreshCw
} from 'lucide-react';

export default function PartnerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await API.get('/partner/me');
      setData(res.data);
      // Update stored partner and emit event for sidebar update
      localStorage.setItem('partner', JSON.stringify(res.data.partner));
      window.dispatchEvent(new CustomEvent('partnerUpdate'));
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const partner = data?.partner || {};
  const recentTxns = data?.recent_transactions || [];

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
          Bonjour, {partner.business_name}
        </h1>
        <p className="text-muted-foreground">Bienvenue sur votre portail partenaire</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Solde disponible</span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet size={16} className="text-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">${partner.balance?.toFixed(2) || '0.00'}</p>
          <p className="text-xs text-muted-foreground mt-1">{partner.currency || 'USD'}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Commission totale</span>
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-green-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-green-400">${partner.total_commission?.toFixed(2) || '0.00'}</p>
          <p className="text-xs text-muted-foreground mt-1">Taux: {partner.commission_rate || 2}%</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Transactions</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users size={16} className="text-blue-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{partner.total_transactions || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Total</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Pays</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Building2 size={16} className="text-purple-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{partner.country || 'CD'}</p>
          <p className="text-xs text-muted-foreground mt-1">Localisation</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up stagger-2">
        <a href="/partner/recharge" className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 rounded-xl p-4 hover:border-green-500/40 transition-all text-center">
          <ArrowUpRight size={24} className="text-green-400 mx-auto mb-2" />
          <p className="font-medium text-foreground text-sm">Recharger Client</p>
        </a>
        <a href="/partner/withdraw" className="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20 rounded-xl p-4 hover:border-red-500/40 transition-all text-center">
          <ArrowDownRight size={24} className="text-red-400 mx-auto mb-2" />
          <p className="font-medium text-foreground text-sm">Retrait Client</p>
        </a>
        <a href="/partner/nfc" className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-xl p-4 hover:border-blue-500/40 transition-all text-center">
          <CreditCard size={24} className="text-blue-400 mx-auto mb-2" />
          <p className="font-medium text-foreground text-sm">Cartes NFC</p>
        </a>
        <a href="/partner/transactions" className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-4 hover:border-purple-500/40 transition-all text-center">
          <TrendingUp size={24} className="text-purple-400 mx-auto mb-2" />
          <p className="font-medium text-foreground text-sm">Historique</p>
        </a>
      </div>

      {/* Recent Transactions */}
      <div className="bg-card border border-border rounded-xl animate-fade-in-up stagger-3">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Transactions récentes</h3>
          <a href="/partner/transactions" className="text-sm text-primary hover:underline">Voir tout</a>
        </div>
        <div className="divide-y divide-border">
          {recentTxns.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucune transaction</p>
          ) : recentTxns.slice(0, 5).map(tx => (
            <div key={tx.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  tx.type === 'topup' || tx.type === 'client_withdraw' || tx.type === 'nfc_withdraw'
                    ? 'bg-green-500/10' 
                    : 'bg-red-500/10'
                }`}>
                  {tx.type === 'topup' || tx.type === 'client_withdraw' || tx.type === 'nfc_withdraw'
                    ? <ArrowUpRight size={16} className="text-green-400" />
                    : <ArrowDownRight size={16} className="text-red-400" />
                  }
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">
                    {tx.type === 'topup' ? 'Rechargement compte' : 
                     tx.type === 'client_recharge' ? 'Recharge client' :
                     tx.type === 'client_withdraw' ? 'Retrait client' :
                     tx.type === 'nfc_recharge' ? 'Recharge NFC' :
                     tx.type === 'nfc_withdraw' ? 'Retrait NFC' : tx.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.client_name || tx.card_name || '-'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-semibold ${
                  tx.type === 'topup' || tx.type === 'client_withdraw' || tx.type === 'nfc_withdraw'
                    ? 'text-green-400' 
                    : 'text-red-400'
                }`}>
                  {tx.type === 'topup' || tx.type === 'client_withdraw' || tx.type === 'nfc_withdraw' ? '+' : '-'}
                  {tx.amount} {tx.currency}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(tx.created_at).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
