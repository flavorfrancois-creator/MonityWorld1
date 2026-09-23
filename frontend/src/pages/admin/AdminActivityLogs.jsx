import React, { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { 
  Activity, Download, Trash2, RefreshCw, Filter, Calendar, User, Shield, 
  Eye, Edit, Plus, X, LogIn, LogOut, CheckCircle, XCircle, UserX, UserCheck,
  FileText, Settings, Printer, ChevronLeft, ChevronRight, BarChart3
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

const ACTION_ICONS = {
  create: Plus,
  read: Eye,
  update: Edit,
  delete: Trash2,
  login: LogIn,
  logout: LogOut,
  approve: CheckCircle,
  reject: XCircle,
  suspend: UserX,
  unsuspend: UserCheck,
  export: Download,
  promote: Shield
};

const ACTION_COLORS = {
  create: 'bg-green-500/20 text-green-400',
  read: 'bg-blue-500/20 text-blue-400',
  update: 'bg-yellow-500/20 text-yellow-400',
  delete: 'bg-red-500/20 text-red-400',
  login: 'bg-purple-500/20 text-purple-400',
  logout: 'bg-gray-500/20 text-gray-400',
  approve: 'bg-emerald-500/20 text-emerald-400',
  reject: 'bg-rose-500/20 text-rose-400',
  suspend: 'bg-orange-500/20 text-orange-400',
  unsuspend: 'bg-teal-500/20 text-teal-400',
  export: 'bg-indigo-500/20 text-indigo-400',
  promote: 'bg-amber-500/20 text-amber-400'
};

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    admin_id: '',
    action_type: '',
    resource_type: '',
    date_from: '',
    date_to: ''
  });
  const [filterOptions, setFilterOptions] = useState({ admins: [], actions: {}, resources: {} });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [settings, setSettings] = useState({ retention_days: 1825, options: [] });
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [activeTab, setActiveTab] = useState('logs');

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 30);
      if (filters.admin_id) params.append('admin_id', filters.admin_id);
      if (filters.action_type) params.append('action_type', filters.action_type);
      if (filters.resource_type) params.append('resource_type', filters.resource_type);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);

      const res = await API.get(`/admin/activity-logs?${params.toString()}`);
      setLogs(res.data.logs);
      setPagination({ page: res.data.page, pages: res.data.pages, total: res.data.total });
      setFilterOptions(res.data.filters);
    } catch (e) {
      console.error('Error fetching logs:', e);
    }
    setLoading(false);
  }, [filters]);

  const fetchStats = async () => {
    try {
      const res = await API.get('/admin/activity-logs/stats');
      setStats(res.data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await API.get('/admin/activity-logs/settings');
      setSettings(res.data);
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
    fetchSettings();
  }, [fetchLogs]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value === 'all' ? '' : value }));
  };

  const applyFilters = () => {
    fetchLogs(1);
  };

  const clearFilters = () => {
    setFilters({ admin_id: '', action_type: '', resource_type: '', date_from: '', date_to: '' });
  };

  const updateRetention = async (days) => {
    try {
      await API.put('/admin/activity-logs/settings', { retention_days: days });
      setSettings(prev => ({ ...prev, retention_days: days }));
      setShowSettings(false);
    } catch (e) {
      console.error('Error updating retention:', e);
    }
  };

  const cleanupLogs = async () => {
    if (!window.confirm('Supprimer les logs anciens selon la politique de rétention ?')) return;
    try {
      const res = await API.delete('/admin/activity-logs/cleanup');
      alert(res.data.message);
      fetchLogs();
    } catch (e) {
      console.error('Error cleaning up logs:', e);
    }
  };

  const deleteLog = async (logId) => {
    if (!window.confirm('Supprimer ce log ?')) return;
    try {
      await API.delete(`/admin/activity-logs/${logId}`);
      fetchLogs(pagination.page);
    } catch (e) {
      console.error('Error deleting log:', e);
    }
  };

  const exportLogs = async (format = 'json') => {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const res = await API.get(`/admin/activity-logs/export?${params.toString()}`);
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity_logs_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
      }
    } catch (e) {
      console.error('Error exporting logs:', e);
    }
  };

  const printLogs = () => {
    window.print();
  };

  const formatDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const ActionIcon = ({ action }) => {
    const Icon = ACTION_ICONS[action] || Activity;
    return <Icon size={14} />;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="text-primary" />
            Historique d'Activité
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Journal des actions administratives • {pagination.total} entrées
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowStats(true)} data-testid="show-stats-btn">
            <BarChart3 size={16} className="mr-1" /> Statistiques
          </Button>
          <Button variant="outline" size="sm" onClick={printLogs} data-testid="print-logs-btn">
            <Printer size={16} className="mr-1" /> Imprimer
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportLogs('json')} data-testid="export-logs-btn">
            <Download size={16} className="mr-1" /> Exporter
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} data-testid="settings-btn">
            <Settings size={16} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-muted-foreground mb-1 block">Administrateur</label>
              <Select value={filters.admin_id || 'all'} onValueChange={(v) => handleFilterChange('admin_id', v)}>
                <SelectTrigger data-testid="filter-admin">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les admins</SelectItem>
                  {filterOptions.admins?.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-muted-foreground mb-1 block">Action</label>
              <Select value={filters.action_type || 'all'} onValueChange={(v) => handleFilterChange('action_type', v)}>
                <SelectTrigger data-testid="filter-action">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  {Object.entries(filterOptions.actions || {}).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-muted-foreground mb-1 block">Ressource</label>
              <Select value={filters.resource_type || 'all'} onValueChange={(v) => handleFilterChange('resource_type', v)}>
                <SelectTrigger data-testid="filter-resource">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les ressources</SelectItem>
                  {Object.entries(filterOptions.resources || {}).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs text-muted-foreground mb-1 block">Date début</label>
              <Input 
                type="date" 
                value={filters.date_from} 
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                data-testid="filter-date-from"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="text-xs text-muted-foreground mb-1 block">Date fin</label>
              <Input 
                type="date" 
                value={filters.date_to} 
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                data-testid="filter-date-to"
              />
            </div>
            <Button onClick={applyFilters} data-testid="apply-filters-btn">
              <Filter size={16} className="mr-1" /> Filtrer
            </Button>
            <Button variant="ghost" onClick={clearFilters}>
              <X size={16} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Chargement...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucune activité trouvée</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="activity-logs-table">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date/Heure</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Administrateur</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Action</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ressource</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Détails</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={log.id} className={`border-b border-border hover:bg-muted/30 ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-muted-foreground" />
                          {formatDate(log.timestamp)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <User size={14} className="text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{log.admin_name}</p>
                            <p className="text-xs text-muted-foreground">{log.admin_role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={`${ACTION_COLORS[log.action] || 'bg-secondary'}`}>
                          <ActionIcon action={log.action} />
                          <span className="ml-1">{log.action_label}</span>
                        </Badge>
                      </td>
                      <td className="p-3">
                        <span className="text-sm">{log.resource_label}</span>
                        {log.resource_id && (
                          <span className="text-xs text-muted-foreground block truncate max-w-[150px]">
                            ID: {log.resource_id}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {log.details && Object.keys(log.details).length > 0 ? (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedLog(log)}
                            data-testid={`view-details-${log.id}`}
                          >
                            <Eye size={14} className="mr-1" /> Voir
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteLog(log.id)}
                          data-testid={`delete-log-${log.id}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} sur {pagination.pages}
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={pagination.page <= 1}
                onClick={() => fetchLogs(pagination.page - 1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchLogs(pagination.page + 1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings size={20} /> Paramètres de Rétention
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Les logs plus anciens que la durée sélectionnée seront supprimés lors du nettoyage.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {settings.options?.map(opt => (
                <Button
                  key={opt.value}
                  variant={settings.retention_days === opt.value ? 'default' : 'outline'}
                  onClick={() => updateRetention(opt.value)}
                  data-testid={`retention-${opt.value}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={cleanupLogs} data-testid="cleanup-logs-btn">
              <Trash2 size={16} className="mr-1" /> Nettoyer maintenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Modal */}
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 size={20} /> Statistiques d'Activité
            </DialogTitle>
          </DialogHeader>
          {stats && (
            <div className="py-4 space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-primary">{stats.total_activities}</p>
                    <p className="text-sm text-muted-foreground">Total d'activités</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-green-500">{stats.by_action?.find(a => a.action === 'create')?.count || 0}</p>
                    <p className="text-sm text-muted-foreground">Créations</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-blue-500">{stats.by_admin?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Admins actifs</p>
                  </CardContent>
                </Card>
              </div>

              {/* Daily Trend */}
              {stats.daily_trend?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Tendance journalière (30 jours)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={stats.daily_trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
                        <Area type="monotone" dataKey="count" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* By Action & Resource */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Par type d'action</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={stats.by_action}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          label={({ label, percent }) => `${label} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {stats.by_action?.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Top 10 Administrateurs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={stats.by_admin} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="#9ca3af" width={80} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
                        <Bar dataKey="count" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log Details Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Détails de l'activité</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="py-4 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Administrateur</p>
                  <p className="font-medium">{selectedLog.admin_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Action</p>
                  <Badge className={ACTION_COLORS[selectedLog.action]}>{selectedLog.action_label}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Ressource</p>
                  <p className="font-medium">{selectedLog.resource_label}</p>
                </div>
              </div>
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div className="mt-4">
                  <p className="text-muted-foreground text-sm mb-2">Détails supplémentaires</p>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
