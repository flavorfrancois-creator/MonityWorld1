import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { 
  Search, Settings, Globe, Send, Download, Upload, PiggyBank, 
  Users, RefreshCw, CreditCard, ChevronRight, CheckCircle2, XCircle,
  Plane, ArrowUpRight, ArrowDownRight, ToggleLeft, ToggleRight
} from 'lucide-react';

const SERVICE_ICONS = {
  send_national: Send,
  receive_national: Download,
  deposit: Upload,
  withdrawal: Download,
  savings: PiggyBank,
  contribution: Users,
  currency_conversion: RefreshCw,
  send_international: Plane,
  receive_international: ArrowDownRight,
  withdrawal_international: ArrowUpRight,
  contribution_international: Globe,
  virtual_cards: CreditCard,
};

const SERVICE_CATEGORIES = {
  national: {
    label: "Services Nationaux",
    services: ["send_national", "receive_national", "deposit", "withdrawal", "savings", "contribution", "currency_conversion"]
  },
  international: {
    label: "Services Internationaux", 
    services: ["send_international", "receive_international", "withdrawal_international", "contribution_international"]
  },
  cards: {
    label: "Cartes",
    services: ["virtual_cards"]
  }
};

export default function AdminCountryServices() {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [services, setServices] = useState({});
  const [serviceLabels, setServiceLabels] = useState({});
  const [loadingServices, setLoadingServices] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchCountries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/admin/services/overview');
      setCountries(res.data.countries || []);
      setServiceLabels(res.data.service_labels || {});
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { fetchCountries(); }, [fetchCountries]);

  const openCountryServices = async (country) => {
    setSelectedCountry(country);
    setLoadingServices(true);
    try {
      const res = await API.get(`/admin/countries/${country.code}/services`);
      setServices(res.data.services || {});
      if (res.data.service_labels) setServiceLabels(res.data.service_labels);
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoadingServices(false); 
    }
  };

  const handleServiceToggle = async (serviceKey, value) => {
    if (!selectedCountry) return;
    setSaving(true);
    try {
      await API.patch(`/admin/countries/${selectedCountry.code}/services`, {
        [serviceKey]: value
      });
      setServices(prev => ({ ...prev, [serviceKey]: value }));
      toast.success(`${serviceLabels[serviceKey]} ${value ? 'activé' : 'désactivé'}`);
      // Update local country data
      setCountries(prev => prev.map(c => 
        c.code === selectedCountry.code 
          ? { 
              ...c, 
              services: { ...c.services, [serviceKey]: value },
              active_services: c.active_services + (value ? 1 : -1)
            } 
          : c
      ));
    } catch (e) { 
      toast.error('Erreur'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleBulkAction = async (action) => {
    if (!selectedCountry) return;
    setSaving(true);
    try {
      const params = new URLSearchParams();
      if (action === 'enable_all') params.append('enable_all', 'true');
      if (action === 'disable_all') params.append('disable_all', 'true');
      if (action === 'enable_national') params.append('national_only', 'true');
      if (action === 'disable_national') params.append('national_only', 'false');
      if (action === 'enable_international') params.append('international_only', 'true');
      if (action === 'disable_international') params.append('international_only', 'false');
      
      const res = await API.patch(`/admin/countries/${selectedCountry.code}/services/bulk?${params.toString()}`);
      setServices(res.data.services);
      toast.success(res.data.message);
      fetchCountries();
    } catch (e) { 
      toast.error('Erreur'); 
    } finally { 
      setSaving(false); 
    }
  };

  const filteredCountries = search 
    ? countries.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : countries;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Configuration des Services
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Activer ou désactiver les services par pays
          </p>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          <Globe size={12} className="mr-1" /> {countries.length} pays
        </Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-md animate-fade-in-up stagger-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          placeholder="Rechercher un pays..." 
          className="pl-9 h-9 text-sm" 
          data-testid="country-search-input" 
        />
      </div>

      {/* Countries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-fade-in-up stagger-2">
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Chargement...
          </div>
        ) : filteredCountries.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Globe size={48} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Aucun pays trouvé</p>
          </div>
        ) : filteredCountries.map(country => (
          <div 
            key={country.code}
            onClick={() => openCountryServices(country)}
            className={`bg-card border rounded-xl p-4 cursor-pointer transition-all hover:border-primary/50 group ${
              !country.is_active ? 'opacity-50 border-border' : 'border-border'
            }`}
            data-testid={`country-card-${country.code}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{country.flag}</span>
                <div>
                  <h3 className="font-medium text-foreground text-sm">{country.name}</h3>
                  <p className="text-xs text-muted-foreground">{country.code}</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            
            {/* Services Status Bar */}
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Services actifs
                </span>
                <span className={`font-medium ${
                  country.active_services === country.total_services 
                    ? 'text-green-400' 
                    : country.active_services === 0 
                      ? 'text-red-400' 
                      : 'text-yellow-400'
                }`}>
                  {country.active_services}/{country.total_services}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    country.active_services === country.total_services 
                      ? 'bg-green-500' 
                      : country.active_services === 0 
                        ? 'bg-red-500' 
                        : 'bg-yellow-500'
                  }`}
                  style={{ width: `${(country.active_services / country.total_services) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Country Services Modal */}
      <Dialog open={!!selectedCountry} onOpenChange={() => setSelectedCountry(null)}>
        <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-3">
              <span className="text-2xl">{selectedCountry?.flag}</span>
              <div>
                <span>{selectedCountry?.name}</span>
                <p className="text-sm font-normal text-muted-foreground">{selectedCountry?.code}</p>
              </div>
            </DialogTitle>
            <DialogDescription>
              Configurer les services disponibles dans ce pays
            </DialogDescription>
          </DialogHeader>

          {loadingServices ? (
            <div className="py-8 text-center text-muted-foreground">Chargement...</div>
          ) : (
            <div className="space-y-6 pt-2">
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleBulkAction('enable_all')}
                  disabled={saving}
                  className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                >
                  <ToggleRight size={14} className="mr-1" /> Tout activer
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleBulkAction('disable_all')}
                  disabled={saving}
                  className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  <ToggleLeft size={14} className="mr-1" /> Tout désactiver
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleBulkAction('enable_national')}
                  disabled={saving}
                >
                  Activer nationaux
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleBulkAction('enable_international')}
                  disabled={saving}
                >
                  Activer internationaux
                </Button>
              </div>

              {/* Services by Category */}
              {Object.entries(SERVICE_CATEGORIES).map(([catKey, category]) => (
                <div key={catKey} className="space-y-3">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    {catKey === 'national' && <Send size={16} className="text-blue-400" />}
                    {catKey === 'international' && <Plane size={16} className="text-purple-400" />}
                    {catKey === 'cards' && <CreditCard size={16} className="text-green-400" />}
                    {category.label}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {category.services.map(svcKey => {
                      const Icon = SERVICE_ICONS[svcKey] || Settings;
                      const isEnabled = services[svcKey] ?? true;
                      return (
                        <div 
                          key={svcKey}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            isEnabled 
                              ? 'bg-green-500/5 border-green-500/20' 
                              : 'bg-secondary/30 border-border'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon size={16} className={isEnabled ? 'text-green-400' : 'text-muted-foreground'} />
                            <span className={`text-sm ${isEnabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {serviceLabels[svcKey] || svcKey}
                            </span>
                          </div>
                          <Switch 
                            checked={isEnabled}
                            onCheckedChange={(value) => handleServiceToggle(svcKey, value)}
                            disabled={saving}
                            data-testid={`toggle-${svcKey}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Status Summary */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Résumé</span>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span className="text-sm text-foreground">
                      {Object.values(services).filter(v => v).length} actifs
                    </span>
                    <span className="text-muted-foreground mx-1">•</span>
                    <XCircle size={14} className="text-red-400" />
                    <span className="text-sm text-foreground">
                      {Object.values(services).filter(v => !v).length} désactivés
                    </span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setSelectedCountry(null)}
              >
                Fermer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
