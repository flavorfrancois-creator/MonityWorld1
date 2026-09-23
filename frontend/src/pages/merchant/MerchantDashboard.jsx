import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../utils/api';
import { toast } from 'sonner';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, FileText, Users,
  ArrowUpRight, Package, Plus, CreditCard
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const MERCHANT_API = '/merchant';

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await API.get(`${MERCHANT_API}/dashboard`);
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = [
    {
      title: "Ventes aujourd'hui",
      value: data?.today?.sales || 0,
      icon: ShoppingCart,
      trend: '+12%',
      trendUp: true,
      color: 'emerald'
    },
    {
      title: "Revenus du jour",
      value: `$${(data?.today?.revenue || 0).toLocaleString()}`,
      icon: DollarSign,
      trend: '+8%',
      trendUp: true,
      color: 'blue'
    },
    {
      title: "Factures en attente",
      value: data?.pending_invoices || 0,
      icon: FileText,
      trend: data?.pending_invoices > 5 ? 'Attention' : 'OK',
      trendUp: data?.pending_invoices <= 5,
      color: 'amber'
    },
    {
      title: "Ventes du mois",
      value: data?.monthly?.sales || 0,
      icon: TrendingUp,
      trend: `$${(data?.monthly?.revenue || 0).toLocaleString()}`,
      trendUp: true,
      color: 'purple'
    },
  ];

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground">
            Bienvenue, {data?.merchant?.business_name || 'Marchand'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate('/merchant/invoices')}
            className="gap-2"
          >
            <FileText size={16} />
            <span className="hidden sm:inline">Nouvelle facture</span>
          </Button>
          <Button 
            onClick={() => navigate('/merchant/pos')}
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
          >
            <CreditCard size={16} />
            <span className="hidden sm:inline">Point de vente</span>
          </Button>
        </div>
      </div>

      {/* Wallet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.wallets?.map((wallet) => (
          <Card key={wallet.id} className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="pt-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-muted-foreground">Solde {wallet.currency}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {wallet.balance.toLocaleString()} {wallet.currency}
                  </p>
                </div>
                {wallet.is_primary && (
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                    Principal
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="hover:border-emerald-500/30 transition-colors">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-lg bg-${stat.color}-500/10 flex items-center justify-center`}>
                  <stat.icon className={`text-${stat.color}-500`} size={20} />
                </div>
                <div className={`flex items-center gap-1 text-xs ${stat.trendUp ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {stat.trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {stat.trend}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Nouvelle vente', icon: CreditCard, path: '/merchant/pos', color: 'emerald' },
          { label: 'Ajouter produit', icon: Package, path: '/merchant/products', color: 'blue' },
          { label: 'Créer facture', icon: FileText, path: '/merchant/invoices', color: 'purple' },
          { label: 'Voir clients', icon: Users, path: '/merchant/clients', color: 'amber' },
        ].map((action) => (
          <Card 
            key={action.label}
            className="cursor-pointer hover:border-emerald-500/30 transition-all hover:scale-[1.02]"
            onClick={() => navigate(action.path)}
          >
            <CardContent className="pt-4 pb-4 flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-xl bg-${action.color}-500/10 flex items-center justify-center mb-2`}>
                <action.icon className={`text-${action.color}-500`} size={24} />
              </div>
              <p className="text-sm font-medium text-foreground">{action.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Transactions récentes</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/merchant/transactions')} className="text-emerald-500">
            Voir tout
            <ArrowUpRight size={14} className="ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {data?.recent_transactions?.length > 0 ? (
            <div className="space-y-3">
              {data.recent_transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      tx.type === 'pos' ? 'bg-emerald-500/10' : 'bg-blue-500/10'
                    }`}>
                      {tx.type === 'pos' ? (
                        <ShoppingCart className="text-emerald-500" size={18} />
                      ) : (
                        <FileText className="text-blue-500" size={18} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {tx.type === 'pos' ? 'Vente POS' : 'Paiement facture'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-500">
                      +{tx.total} {tx.currency}
                    </p>
                    <Badge variant={tx.status === 'completed' ? 'default' : 'outline'} className="text-xs">
                      {tx.status === 'completed' ? 'Complété' : 'En attente'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="mx-auto mb-2 opacity-50" size={32} />
              <p>Aucune transaction récente</p>
              <Button 
                variant="link" 
                className="text-emerald-500 mt-2"
                onClick={() => navigate('/merchant/pos')}
              >
                Effectuer une vente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
