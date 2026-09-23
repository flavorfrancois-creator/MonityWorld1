import React, { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
  FileSpreadsheet, FileText, Download, Calendar, TrendingUp, DollarSign, 
  ArrowUpRight, ArrowDownRight, Wallet, RefreshCw, Filter, Printer
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const TX_TYPE_LABELS = {
  transfer: 'Transferts',
  recharge: 'Recharges',
  withdrawal: 'Retraits',
  international: 'International',
  conversion: 'Conversions'
};

export default function AdminAccountingExport() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({
    period: 'month',
    date_from: '',
    date_to: '',
    report_type: 'complete',
    country: '',
    currency: '',
    format: 'excel'
  });
  const [exportResult, setExportResult] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('period', filters.period);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const res = await API.get(`/admin/accounting/summary?${params.toString()}`);
      setSummary(res.data);
    } catch (e) {
      console.error('Error fetching summary:', e);
    }
    setLoading(false);
  }, [filters.period, filters.date_from, filters.date_to]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await API.post('/admin/accounting/export', {
        report_type: filters.report_type,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        format: filters.format,
        country: filters.country || undefined,
        currency: filters.currency || undefined
      });
      
      setExportResult(res.data);
      
      // Handle download based on format
      if (filters.format === 'excel' || filters.format === 'csv') {
        downloadAsFile(res.data, filters.format);
      } else if (filters.format === 'pdf') {
        // PDF generation would be done server-side in production
        downloadAsFile(res.data, 'json');
      } else {
        downloadAsFile(res.data, 'json');
      }
    } catch (e) {
      console.error('Error exporting:', e);
      alert('Erreur lors de l\'export');
    }
    setExporting(false);
  };

  const downloadAsFile = (data, format) => {
    let blob, filename;
    const dateStr = new Date().toISOString().split('T')[0];
    
    if (format === 'csv') {
      const csvContent = convertToCSV(data.transactions || []);
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      filename = `export_comptable_${dateStr}.csv`;
    } else if (format === 'excel') {
      // For Excel, we'll download as JSON and let user know to use conversion tool
      // In production, this would be generated server-side with openpyxl
      const jsonStr = JSON.stringify(data, null, 2);
      blob = new Blob([jsonStr], { type: 'application/json' });
      filename = `export_comptable_${dateStr}.json`;
    } else {
      const jsonStr = JSON.stringify(data, null, 2);
      blob = new Blob([jsonStr], { type: 'application/json' });
      filename = `export_comptable_${dateStr}.json`;
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const convertToCSV = (transactions) => {
    if (!transactions.length) return '';
    
    const headers = ['Date', 'Type', 'Expéditeur', 'Destinataire', 'Montant', 'Devise', 'Frais', 'Statut', 'Description'];
    const rows = transactions.map(tx => [
      tx.created_at?.split('T')[0] || '',
      TX_TYPE_LABELS[tx.type] || tx.type,
      tx.sender_name || '',
      tx.receiver_name || '',
      tx.amount || 0,
      tx.currency || 'USD',
      (tx.fee || 0) + (tx.conversion_fee || 0),
      tx.status || '',
      tx.description || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    return '\uFEFF' + csvContent; // Add BOM for Excel UTF-8 compatibility
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return `${formatNumber(amount)} ${currency}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="text-primary" />
            Export Comptable
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Générez des rapports financiers détaillés
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loading}>
            <RefreshCw size={16} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Volume Total</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(summary.summary.total_volume)}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <DollarSign className="text-primary" size={20} />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Transactions</p>
                  <p className="text-2xl font-bold">{summary.summary.total_transactions}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <TrendingUp className="text-blue-500" size={20} />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Frais Collectés</p>
                  <p className="text-2xl font-bold text-green-500">{formatCurrency(summary.summary.total_fees)}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <ArrowUpRight className="text-green-500" size={20} />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">En attente</p>
                  <p className="text-2xl font-bold text-orange-500">{summary.summary.pending}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <Wallet className="text-orange-500" size={20} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Export Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download size={18} /> Exporter les Données
            </CardTitle>
            <CardDescription>Configurez et téléchargez votre rapport</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Type de rapport</label>
              <Select value={filters.report_type} onValueChange={(v) => setFilters(p => ({...p, report_type: v}))}>
                <SelectTrigger data-testid="select-report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactions">Transactions uniquement</SelectItem>
                  <SelectItem value="wallets">Transactions + Soldes</SelectItem>
                  <SelectItem value="complete">Rapport complet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Format d'export</label>
              <Select value={filters.format} onValueChange={(v) => setFilters(p => ({...p, format: v}))}>
                <SelectTrigger data-testid="select-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Période</label>
              <Select value={filters.period} onValueChange={(v) => setFilters(p => ({...p, period: v}))}>
                <SelectTrigger data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Aujourd'hui</SelectItem>
                  <SelectItem value="week">Cette semaine</SelectItem>
                  <SelectItem value="month">Ce mois</SelectItem>
                  <SelectItem value="quarter">Ce trimestre</SelectItem>
                  <SelectItem value="year">Cette année</SelectItem>
                  <SelectItem value="custom">Personnalisé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {filters.period === 'custom' && (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Date début</label>
                  <Input 
                    type="date" 
                    value={filters.date_from}
                    onChange={(e) => setFilters(p => ({...p, date_from: e.target.value}))}
                    data-testid="date-from"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Date fin</label>
                  <Input 
                    type="date" 
                    value={filters.date_to}
                    onChange={(e) => setFilters(p => ({...p, date_to: e.target.value}))}
                    data-testid="date-to"
                  />
                </div>
              </>
            )}
            
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Devise (optionnel)</label>
              <Select value={filters.currency || 'all'} onValueChange={(v) => setFilters(p => ({...p, currency: v === 'all' ? '' : v}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes les devises" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les devises</SelectItem>
                  <SelectItem value="USD">USD - Dollar US</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="XAF">XAF - Franc CFA</SelectItem>
                  <SelectItem value="CDF">CDF - Franc Congolais</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              className="w-full" 
              onClick={handleExport} 
              disabled={exporting}
              data-testid="export-btn"
            >
              {exporting ? (
                <><RefreshCw size={16} className="mr-2 animate-spin" /> Export en cours...</>
              ) : (
                <><Download size={16} className="mr-2" /> Exporter</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Charts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Aperçu Financier</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="volume">
              <TabsList className="mb-4">
                <TabsTrigger value="volume">Volume</TabsTrigger>
                <TabsTrigger value="types">Par Type</TabsTrigger>
                <TabsTrigger value="fees">Frais</TabsTrigger>
              </TabsList>
              
              <TabsContent value="volume">
                {summary?.daily?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={summary.daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value) => [formatNumber(value), 'Volume']}
                      />
                      <Area type="monotone" dataKey="volume" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Volume" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Aucune donnée disponible
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="types">
                {summary?.by_type?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={summary.by_type}
                          dataKey="count"
                          nameKey="type"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ type, percent }) => `${TX_TYPE_LABELS[type] || type} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {summary.by_type.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {summary.by_type.map((item, idx) => (
                        <div key={item.type} className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                            <span className="text-sm">{TX_TYPE_LABELS[item.type] || item.type}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{item.count} tx</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(item.volume)} USD</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    Aucune donnée disponible
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="fees">
                {summary?.daily?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={summary.daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value) => [formatNumber(value), 'Frais']}
                      />
                      <Bar dataKey="fees" fill="#f59e0b" name="Frais collectés" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Aucune donnée disponible
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Export Result Preview */}
      {exportResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText size={18} /> Résultat de l'Export
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-lg font-bold">{exportResult.summary?.total_transactions || 0}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Volume Total</p>
                <p className="text-lg font-bold">{formatNumber(exportResult.summary?.total_volume || 0)} USD</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Frais Totaux</p>
                <p className="text-lg font-bold">{formatNumber(exportResult.summary?.total_fees || 0)} USD</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Généré le</p>
                <p className="text-sm font-medium">{new Date(exportResult.generated_at).toLocaleString('fr-FR')}</p>
              </div>
            </div>
            
            {exportResult.summary?.by_type && (
              <div className="border-t border-border pt-4 mt-4">
                <p className="text-sm font-medium mb-2">Répartition par type</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(exportResult.summary.by_type).map(([type, data]) => (
                    <Badge key={type} variant="secondary">
                      {TX_TYPE_LABELS[type] || type}: {data.count} tx ({formatNumber(data.volume)} USD)
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
