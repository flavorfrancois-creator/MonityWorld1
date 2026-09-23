import React, { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { 
  UserCheck, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp, 
  TrendingDown, FileText, Eye, RefreshCw, Calendar, Users, Percent
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, LineChart, Line
} from 'recharts';

const CHART_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

const KYC_STATUS_LABELS = {
  pending: 'En attente',
  submitted: 'Soumis',
  under_review: 'En cours de révision',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  pre_approved: 'Pré-approuvé'
};

const KYC_STATUS_COLORS = {
  pending: 'bg-gray-500/20 text-gray-400',
  submitted: 'bg-blue-500/20 text-blue-400',
  under_review: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  pre_approved: 'bg-purple-500/20 text-purple-400'
};

const DOCUMENT_TYPES = {
  national_id: 'Carte d\'identité',
  passport: 'Passeport',
  driver_license: 'Permis de conduire',
  residence_permit: 'Permis de séjour'
};

export default function AdminKYCDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState('month');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/kyc/stats?period=${period}`);
      setStats(res.data);
    } catch (e) {
      console.error('Error fetching KYC stats:', e);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats, refreshKey]);

  const formatNumber = (num) => {
    return new Intl.NumberFormat('fr-FR').format(num || 0);
  };

  const formatDuration = (hours) => {
    if (!hours) return '-';
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} h`;
    return `${(hours / 24).toFixed(1)} j`;
  };

  const formatPercent = (value) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading && !stats) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCheck className="text-primary" />
            Performances KYC
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyse détaillée du processus de vérification d'identité
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px]" data-testid="period-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="month">Ce mois</SelectItem>
              <SelectItem value="quarter">Ce trimestre</SelectItem>
              <SelectItem value="year">Cette année</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k+1)} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {stats && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Demandes</p>
                    <p className="text-2xl font-bold">{formatNumber(stats.total_requests)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <FileText className="text-blue-500" size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Taux d'Approbation</p>
                    <p className="text-2xl font-bold text-green-500">{formatPercent(stats.approval_rate)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="text-green-500" size={20} />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs">
                  {stats.approval_rate > stats.previous_approval_rate ? (
                    <><TrendingUp size={12} className="text-green-500" /> +{formatPercent(stats.approval_rate - stats.previous_approval_rate)}</>
                  ) : (
                    <><TrendingDown size={12} className="text-red-500" /> {formatPercent(stats.approval_rate - stats.previous_approval_rate)}</>
                  )}
                  <span className="text-muted-foreground ml-1">vs période précédente</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Taux de Rejet</p>
                    <p className="text-2xl font-bold text-red-500">{formatPercent(stats.rejection_rate)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XCircle className="text-red-500" size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Temps Moyen</p>
                    <p className="text-2xl font-bold text-yellow-500">{formatDuration(stats.avg_processing_time)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <Clock className="text-yellow-500" size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">En Attente</p>
                    <p className="text-2xl font-bold text-orange-500">{formatNumber(stats.pending_count)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <AlertTriangle className="text-orange-500" size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Distribution par Statut</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={stats.by_status}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={40}
                      >
                        {stats.by_status?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [formatNumber(value), 'Demandes']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {stats.by_status?.map((item, idx) => (
                      <div key={item.status} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <Badge className={KYC_STATUS_COLORS[item.status] || 'bg-secondary'}>
                            {KYC_STATUS_LABELS[item.status] || item.status}
                          </Badge>
                        </div>
                        <span className="font-medium">{formatNumber(item.count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Daily Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Évolution Journalière</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.daily_trend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={stats.daily_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="submitted" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} name="Soumis" />
                      <Area type="monotone" dataKey="approved" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.5} name="Approuvés" />
                      <Area type="monotone" dataKey="rejected" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.5} name="Rejetés" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Documents Most Rejected */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Documents les Plus Rejetés</CardTitle>
                <CardDescription>Analyse des types de documents avec le plus de rejets</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.rejected_documents?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.rejected_documents} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis 
                        dataKey="document_type" 
                        type="category" 
                        tick={{ fontSize: 10 }} 
                        stroke="#9ca3af" 
                        width={100}
                        tickFormatter={(v) => DOCUMENT_TYPES[v] || v}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value) => [formatNumber(value), 'Rejets']}
                        labelFormatter={(v) => DOCUMENT_TYPES[v] || v}
                      />
                      <Bar dataKey="count" fill="#ef4444" name="Nombre de rejets" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Aucun rejet enregistré
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rejection Reasons */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Raisons de Rejet</CardTitle>
                <CardDescription>Motifs les plus fréquents de rejet des demandes</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.rejection_reasons?.length > 0 ? (
                  <div className="space-y-3">
                    {stats.rejection_reasons.slice(0, 5).map((reason, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm truncate max-w-[200px]">{reason.reason}</span>
                            <span className="text-sm font-medium">{formatNumber(reason.count)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-red-500 rounded-full transition-all duration-500"
                              style={{ width: `${(reason.count / stats.rejection_reasons[0].count) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Aucune raison de rejet enregistrée
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Processing Time by Document Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Temps de Traitement par Type de Document</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.processing_time_by_doc?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.processing_time_by_doc}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="document_type" 
                      tick={{ fontSize: 10 }} 
                      stroke="#9ca3af"
                      tickFormatter={(v) => DOCUMENT_TYPES[v] || v}
                    />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                      formatter={(value) => [formatDuration(value), 'Temps moyen']}
                      labelFormatter={(v) => DOCUMENT_TYPES[v] || v}
                    />
                    <Legend />
                    <Bar dataKey="avg_hours" fill="#f59e0b" name="Temps moyen (heures)" />
                    <Bar dataKey="total_count" fill="#3b82f6" name="Nombre de demandes" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  Aucune donnée de temps de traitement disponible
                </div>
              )}
            </CardContent>
          </Card>

          {/* OCR Auto-approval stats if available */}
          {stats.ocr_stats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statistiques OCR et Pré-approbation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Documents analysés</p>
                    <p className="text-2xl font-bold text-primary">{formatNumber(stats.ocr_stats.total_analyzed)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Confiance moyenne OCR</p>
                    <p className="text-2xl font-bold text-blue-500">{formatPercent(stats.ocr_stats.avg_confidence)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Pré-approuvés auto</p>
                    <p className="text-2xl font-bold text-green-500">{formatNumber(stats.ocr_stats.pre_approved)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Taux pré-approbation</p>
                    <p className="text-2xl font-bold text-purple-500">{formatPercent(stats.ocr_stats.pre_approval_rate)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
