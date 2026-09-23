import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Search, Users, Phone, ShoppingCart, Calendar, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '../../components/ui/table';

const MERCHANT_API = '/merchant';

export default function MerchantClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await API.get(`${MERCHANT_API}/clients`);
      setClients(res.data.clients);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clients</h1>
        <p className="text-muted-foreground">{clients.length} client(s) ayant acheté</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Users className="text-emerald-500" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{clients.length}</p>
                <p className="text-xs text-muted-foreground">Total clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Phone className="text-blue-500" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{clients.filter(c => c.has_monity_account).length}</p>
                <p className="text-xs text-muted-foreground">Avec Monity</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <ShoppingCart className="text-purple-500" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{clients.reduce((sum, c) => sum + c.total_purchases, 0)}</p>
                <p className="text-xs text-muted-foreground">Total achats</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TrendingUp className="text-amber-500" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">${clients.reduce((sum, c) => sum + c.total_spent, 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Revenus clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou téléphone..."
          className="pl-10"
        />
      </div>

      {/* Clients Table */}
      {filtered.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Achats</TableHead>
                  <TableHead>Total dépensé</TableHead>
                  <TableHead className="hidden sm:table-cell">Dernier achat</TableHead>
                  <TableHead className="hidden lg:table-cell">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((client, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <span className="text-emerald-500 font-bold text-sm">
                            {client.name?.charAt(0).toUpperCase() || 'C'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.phone}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">{client.total_purchases} achat(s)</Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-500">
                      ${client.total_spent.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {client.last_purchase 
                        ? new Date(client.last_purchase).toLocaleDateString('fr-FR')
                        : '-'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {client.has_monity_account ? (
                        <Badge variant="default" className="bg-emerald-500">Monity</Badge>
                      ) : (
                        <Badge variant="outline">Guest</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto mb-3 text-muted-foreground" size={48} />
            <h3 className="text-lg font-semibold text-foreground">Aucun client</h3>
            <p className="text-muted-foreground mt-1">
              {search ? 'Aucun client trouvé' : 'Vos clients apparaîtront ici après leurs achats'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
