import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, DollarSign, Users, ArrowUpRight, ArrowDownRight,
  Wallet, Send, Download, CreditCard, Globe, Building2, Loader2, RefreshCw
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const PERIOD_OPTIONS = [
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'biweekly', label: 'Bi-hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'quarterly', label: 'Trimestriel' },
  { value: 'semester', label: 'Semestriel' },
  { value: 'yearly', label: 'Annuel' }
];

const TX_LABELS = {
  recharge: { label: 'Recharges', color: '#10B981', icon: ArrowUpRight },
  withdrawal: { label: 'Retraits', color: '#EF4444', icon: ArrowDownRight },
  transfer: { label: 'Transferts', color: '#3B82F6', icon: Send },
  deposit: { label: 'Dépôts', color: '#F59E0B', icon: Download },
  send_international: { label: 'Envois Int.', color: '#8B5CF6', icon: Globe },
  receive_international: { label: 'Réceptions Int.', color: '#EC4899', icon: Globe }
};

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [analytics, setAnalytics] = useState(null);
  const [partnerAnalytics, setPartnerAnalytics] = useState(null);
  const [overview, setOverview] = useState(null);
  const [partnerGroupBy, setPartnerGroupBy] = useState('country');
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, partnerRes, overviewRes] = await Promise.all([
        API.get(`/admin/analytics/transactions?period=${period}&year=${year}`),
        API.get(`/admin/analytics/partners?group_by=${partnerGroupBy}&year=${year}`),
        API.get('/admin/analytics/overview')
      ]);
      setAnalytics(analyticsRes.data);
      setPartnerAnalytics(partnerRes.data);
      setOverview(overviewRes.data);
    } catch (e) {
      toast.error('Erreur de chargement des analytics');
    } finally {
      setLoading(false);
    }
  }, [period, year, partnerGroupBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Prepare chart data
  const prepareVolumeData = () => {
    if (!analytics) return [];
    const allPeriods = new Set();
    Object.values(analytics.analytics).forEach(type => {
      type.data.forEach(d => allPeriods.add(d.period));
    });
    
    return Array.from(allPeriods).sort().map(p => {
      const row = { period: p.split('-').pop() };
      Object.entries(analytics.analytics).forEach(([type, data]) => {
        const match = data.data.find(d => d.period === p);
        row[type] = match ? match.amount : 0;
      });
      return row;
    });
  };

  const preparePieData = () => {
    if (!analytics) return [];
    return Object.entries(analytics.analytics)
      .filter(([_, data]) => data.total_amount > 0)
      .map(([type, data]) => ({
        name: TX_LABELS[type]?.label || type,
        value: data.total_amount,
        color: TX_LABELS[type]?.color || '#888'
      }));
  };

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value/1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value/1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (loading && !analytics) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={40} />
          <p className="text-muted-foreground">Chargement des analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Tableau de Contrôle
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visualisez les performances et tendances
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up stagger-1">
          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Aujourd'hui</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(overview.today.volume)}</p>
                  <p className="text-xs text-green-400">{overview.today.transactions} tx</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <TrendingUp size={20} className="text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Ce mois</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(overview.month.volume)}</p>
                  <p className="text-xs text-blue-400">{overview.month.transactions} tx</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <DollarSign size={20} className="text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Frais collectés</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(overview.month.fees)}</p>
                  <p className="text-xs text-amber-400">ce mois</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Wallet size={20} className="text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Nouveaux clients</p>
                  <p className="text-2xl font-bold text-foreground">{overview.month.new_users}</p>
                  <p className="text-xs text-purple-400">ce mois</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Users size={20} className="text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Alerts */}
      {overview && (overview.pending.kyc > 0 || overview.pending.partners > 0 || overview.pending.withdrawals > 0) && (
        <div className="flex flex-wrap gap-3 animate-fade-in-up stagger-2">
          {overview.pending.kyc > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
              <Users size={14} className="text-yellow-400" />
              <span className="text-sm text-yellow-400">{overview.pending.kyc} KYC en attente</span>
            </div>
          )}
          {overview.pending.partners > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
              <Building2 size={14} className="text-blue-400" />
              <span className="text-sm text-blue-400">{overview.pending.partners} partenaires en attente</span>
            </div>
          )}
          {overview.pending.withdrawals > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
              <CreditCard size={14} className="text-red-400" />
              <span className="text-sm text-red-400">{overview.pending.withdrawals} retraits en attente</span>
            </div>
          )}
        </div>
      )}

      {/* Main Charts */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-fade-in-up stagger-3">
        <TabsList className="bg-secondary/30 p-1">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="partners">Partenaires</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Volume Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Volume par type de transaction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={prepareVolumeData()}>
                      <defs>
                        {Object.entries(TX_LABELS).map(([key, { color }]) => (
                          <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={color} stopOpacity={0}/>
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="period" stroke="#666" fontSize={12} />
                      <YAxis stroke="#666" fontSize={12} tickFormatter={formatCurrency} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Legend />
                      {Object.entries(TX_LABELS).map(([key, { label, color }]) => (
                        <Area
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={label}
                          stroke={color}
                          fill={`url(#gradient-${key})`}
                          strokeWidth={2}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Distribution Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Répartition</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={preparePieData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {preparePieData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats Cards */}
          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(analytics.analytics).map(([type, data]) => {
                const config = TX_LABELS[type];
                const Icon = config?.icon || DollarSign;
                return (
                  <Card key={type} className="bg-card/50">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${config?.color}20` }}
                        >
                          <Icon size={14} style={{ color: config?.color }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{config?.label}</span>
                      </div>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(data.total_amount)}</p>
                      <p className="text-xs text-muted-foreground">{data.total_count} transactions</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="mt-6 space-y-6">
          {/* Detailed Transaction Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recharges vs Retraits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prepareVolumeData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="period" stroke="#666" fontSize={12} />
                      <YAxis stroke="#666" fontSize={12} tickFormatter={formatCurrency} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Legend />
                      <Bar dataKey="recharge" name="Recharges" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="withdrawal" name="Retraits" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Transferts & Dépôts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={prepareVolumeData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="period" stroke="#666" fontSize={12} />
                      <YAxis stroke="#666" fontSize={12} tickFormatter={formatCurrency} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="transfer" name="Transferts" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="deposit" name="Dépôts" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* International */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transactions Internationales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={prepareVolumeData()}>
                    <defs>
                      <linearGradient id="intSendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="intRecvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#EC4899" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="period" stroke="#666" fontSize={12} />
                    <YAxis stroke="#666" fontSize={12} tickFormatter={formatCurrency} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="send_international" name="Envois Int." stroke="#8B5CF6" fill="url(#intSendGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="receive_international" name="Réceptions Int." stroke="#EC4899" fill="url(#intRecvGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partners" className="mt-6 space-y-6">
          {/* Partner Grouping */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Grouper par:</span>
            <Select value={partnerGroupBy} onValueChange={setPartnerGroupBy}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="country">Pays</SelectItem>
                <SelectItem value="zone">Zone géographique</SelectItem>
                <SelectItem value="transaction_type">Type de transaction</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {partnerAnalytics && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Partner Volume by Group */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Volume par {partnerGroupBy === 'country' ? 'pays' : partnerGroupBy === 'zone' ? 'zone' : 'type'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={partnerAnalytics.data.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis type="number" stroke="#666" fontSize={12} tickFormatter={formatCurrency} />
                          <YAxis dataKey="name" type="category" stroke="#666" fontSize={11} width={80} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                            formatter={(value) => formatCurrency(value)}
                          />
                          <Bar dataKey="volume" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Partner Commission */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Commissions générées</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={partnerAnalytics.data.slice(0, 8).map((d, i) => ({
                              ...d,
                              color: COLORS[i % COLORS.length]
                            }))}
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            dataKey="commission"
                            nameKey="name"
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={false}
                          >
                            {partnerAnalytics.data.slice(0, 8).map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                            formatter={(value) => formatCurrency(value)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Partners */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top 10 Partenaires</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 text-muted-foreground font-medium">#</th>
                          <th className="text-left py-3 text-muted-foreground font-medium">Partenaire</th>
                          <th className="text-left py-3 text-muted-foreground font-medium">Pays</th>
                          <th className="text-right py-3 text-muted-foreground font-medium">Transactions</th>
                          <th className="text-right py-3 text-muted-foreground font-medium">Volume</th>
                          <th className="text-right py-3 text-muted-foreground font-medium">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partnerAnalytics.top_partners.map((partner, index) => (
                          <tr key={partner._id} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="py-3 text-muted-foreground">{index + 1}</td>
                            <td className="py-3 font-medium text-foreground">{partner.name}</td>
                            <td className="py-3 text-muted-foreground">{partner.country}</td>
                            <td className="py-3 text-right text-foreground">{partner.transactions}</td>
                            <td className="py-3 text-right text-foreground">{formatCurrency(partner.volume)}</td>
                            <td className="py-3 text-right text-green-400">{formatCurrency(partner.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
