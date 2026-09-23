import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Globe, Search, Check, X, Plus } from 'lucide-react';

export default function AdminCountries() {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newCountry, setNewCountry] = useState({
    code: '', name: '', dial_code: '', currency_code: '', flag: ''
  });

  const fetchCountries = useCallback(async () => {
    try {
      const res = await API.get('/countries/all');
      setCountries(res.data || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCountries(); }, [fetchCountries]);

  const toggleCountry = async (code, currentStatus) => {
    try {
      await API.patch(`/admin/countries/${code}`, null, {
        params: { is_active: !currentStatus }
      });
      toast.success(`Pays ${!currentStatus ? 'activé' : 'désactivé'}`);
      fetchCountries();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const addCountry = async () => {
    if (!newCountry.code || !newCountry.name || !newCountry.dial_code || !newCountry.currency_code) {
      toast.error('Remplissez tous les champs obligatoires');
      return;
    }
    try {
      await API.post('/admin/countries', newCountry);
      toast.success('Pays ajouté !');
      setShowAdd(false);
      setNewCountry({ code: '', name: '', dial_code: '', currency_code: '', flag: '' });
      fetchCountries();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const filtered = countries.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = countries.filter(c => c.is_active).length;

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Gestion des Pays</h1>
          <p className="text-sm text-muted-foreground">{activeCount} pays actifs sur {countries.length}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="add-country-btn">
          <Plus size={16} className="mr-2" />
          Ajouter un pays
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher un pays..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="search-countries"
        />
      </div>

      {/* Add Country Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up">
            <h3 className="text-lg font-semibold text-foreground mb-4">Ajouter un pays</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Code ISO (2 lettres)</label>
                  <Input
                    placeholder="CD"
                    value={newCountry.code}
                    onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value.toUpperCase() })}
                    maxLength={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Indicatif</label>
                  <Input
                    placeholder="+243"
                    value={newCountry.dial_code}
                    onChange={(e) => setNewCountry({ ...newCountry, dial_code: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">Nom du pays</label>
                <Input
                  placeholder="RD Congo"
                  value={newCountry.name}
                  onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Code devise</label>
                  <Input
                    placeholder="CDF"
                    value={newCountry.currency_code}
                    onChange={(e) => setNewCountry({ ...newCountry, currency_code: e.target.value.toUpperCase() })}
                    maxLength={3}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Emoji drapeau</label>
                  <Input
                    placeholder="🇨🇩"
                    value={newCountry.flag}
                    onChange={(e) => setNewCountry({ ...newCountry, flag: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setShowAdd(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={addCountry}>
                Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Countries Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Pays</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Code</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Indicatif</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Devise</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Statut</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((country, i) => (
                <tr key={country.id} className={`border-t border-border ${i % 2 === 0 ? '' : 'bg-secondary/20'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{country.flag}</span>
                      <span className="font-medium text-foreground">{country.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{country.code}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{country.dial_code}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{country.currency_code}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                      country.is_active 
                        ? 'bg-green-500/10 text-green-400' 
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {country.is_active ? <Check size={12} /> : <X size={12} />}
                      {country.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={country.is_active ? 'destructive' : 'default'}
                      onClick={() => toggleCountry(country.code, country.is_active)}
                      data-testid={`toggle-country-${country.code}`}
                    >
                      {country.is_active ? 'Désactiver' : 'Activer'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filtered.length === 0 && (
          <div className="p-12 text-center">
            <Globe size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
            <p className="text-muted-foreground">Aucun pays trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}
