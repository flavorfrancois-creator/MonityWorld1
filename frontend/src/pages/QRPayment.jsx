import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { QrCode, Scan, Send, ArrowLeft, Copy, Check, Camera } from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

export default function QRPayment() {
  const { user } = useAuth();
  const [mode, setMode] = useState('generate'); // 'generate' | 'scan' | 'pay'
  const [qrData, setQrData] = useState(null);
  const [scannedData, setScannedData] = useState(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [copied, setCopied] = useState(false);
  const [manualQrInput, setManualQrInput] = useState('');

  const fetchQRData = useCallback(async () => {
    try {
      const res = await API.get('/qr/generate');
      setQrData(res.data);
    } catch (e) {
      toast.error('Erreur de génération QR');
    }
  }, []);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await API.get('/wallet/wallets');
      setWallets(res.data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchQRData();
    fetchWallets();
  }, [fetchQRData, fetchWallets]);

  const copyQrCode = () => {
    if (qrData?.qr_data) {
      navigator.clipboard.writeText(qrData.qr_data);
      setCopied(true);
      toast.success('Code QR copié !');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleScanInput = () => {
    if (!manualQrInput.trim()) {
      toast.error('Veuillez entrer un code QR');
      return;
    }
    try {
      const decoded = JSON.parse(atob(manualQrInput.trim()));
      if (decoded.type !== 'monity_payment') {
        toast.error('Code QR invalide');
        return;
      }
      setScannedData(decoded);
      setMode('pay');
    } catch (e) {
      toast.error('Code QR invalide ou corrompu');
    }
  };

  const handlePay = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Montant invalide');
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/qr/pay', null, {
        params: {
          qr_data: btoa(JSON.stringify(scannedData)),
          amount: parseFloat(amount),
          currency
        }
      });
      toast.success(res.data.message);
      setMode('generate');
      setScannedData(null);
      setAmount('');
      fetchWallets();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de paiement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        {mode !== 'generate' && (
          <button onClick={() => { setMode('generate'); setScannedData(null); }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Paiement QR Code</h1>
          <p className="text-sm text-muted-foreground">Envoyez ou recevez de l'argent instantanément</p>
        </div>
      </div>

      {/* Mode Tabs */}
      {mode === 'generate' && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('generate')}
            className="flex flex-col items-center gap-2 p-6 rounded-xl bg-primary/10 border-2 border-primary text-primary"
            data-testid="qr-receive-tab"
          >
            <QrCode size={32} />
            <span className="font-medium">Recevoir</span>
          </button>
          <button
            onClick={() => setMode('scan')}
            className="flex flex-col items-center gap-2 p-6 rounded-xl bg-card border border-border hover:border-primary/30 text-foreground"
            data-testid="qr-send-tab"
          >
            <Scan size={32} />
            <span className="font-medium">Envoyer</span>
          </button>
        </div>
      )}

      {/* Generate QR Mode */}
      {mode === 'generate' && qrData && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 animate-fade-in-up">
          <div className="text-center">
            <h3 className="font-semibold text-foreground mb-2">Votre Code QR</h3>
            <p className="text-sm text-muted-foreground">Partagez ce code pour recevoir des paiements</p>
          </div>

          {/* QR Code Display */}
          <div className="flex justify-center">
            <div className="bg-white p-6 rounded-2xl" data-testid="qr-code-display">
              <div className="w-48 h-48 bg-gradient-to-br from-primary/20 to-blue-500/20 rounded-xl flex items-center justify-center">
                <QrCode size={120} className="text-primary" />
              </div>
            </div>
          </div>

          {/* User Info */}
          <div className="text-center space-y-1">
            <p className="font-semibold text-foreground">{qrData.display_data?.name}</p>
            <p className="text-sm text-muted-foreground">{qrData.display_data?.phone}</p>
            <p className="text-xs text-muted-foreground font-mono">N° {qrData.display_data?.account}</p>
          </div>

          {/* Copy Button */}
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={copyQrCode}
            data-testid="copy-qr-btn"
          >
            {copied ? <Check size={16} className="mr-2" /> : <Copy size={16} className="mr-2" />}
            {copied ? 'Copié !' : 'Copier le code'}
          </Button>
        </div>
      )}

      {/* Scan QR Mode */}
      {mode === 'scan' && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 animate-fade-in-up">
          <div className="text-center">
            <Camera size={48} className="mx-auto text-muted-foreground mb-2" />
            <h3 className="font-semibold text-foreground">Scanner un Code QR</h3>
            <p className="text-sm text-muted-foreground mt-1">Collez le code QR reçu</p>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Collez le code QR ici..."
              value={manualQrInput}
              onChange={(e) => setManualQrInput(e.target.value)}
              className="font-mono text-sm"
              data-testid="qr-input"
            />
            <Button className="w-full" onClick={handleScanInput} data-testid="validate-qr-btn">
              <Scan size={16} className="mr-2" />
              Valider le code
            </Button>
          </div>

          <Button variant="ghost" className="w-full" onClick={() => setMode('generate')}>
            <ArrowLeft size={16} className="mr-2" />
            Retour
          </Button>
        </div>
      )}

      {/* Pay Mode */}
      {mode === 'pay' && scannedData && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 animate-fade-in-up">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Send size={24} className="text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">Envoyer à</h3>
            <p className="text-lg font-bold text-primary mt-1">{scannedData.name}</p>
            <p className="text-sm text-muted-foreground">{scannedData.phone}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Montant</label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 text-lg font-bold"
                  data-testid="qr-amount-input"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="bg-secondary border border-border rounded-lg px-3 text-foreground"
                  data-testid="qr-currency-select"
                >
                  {wallets.map(w => (
                    <option key={w.currency} value={w.currency}>
                      {w.currency} ({CURRENCY_SYMBOLS[w.currency]}{w.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {amount && parseFloat(amount) > 0 && (
              <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Montant</span>
                  <span className="text-foreground">{CURRENCY_SYMBOLS[currency]}{parseFloat(amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frais (1%)</span>
                  <span className="text-foreground">{CURRENCY_SYMBOLS[currency]}{(parseFloat(amount) * 0.01).toFixed(2)}</span>
                </div>
                <div className="border-t border-border pt-1 flex justify-between font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{CURRENCY_SYMBOLS[currency]}{(parseFloat(amount) * 1.01).toFixed(2)}</span>
                </div>
              </div>
            )}

            <Button 
              className="w-full" 
              onClick={handlePay} 
              disabled={loading || !amount || parseFloat(amount) <= 0}
              data-testid="qr-pay-btn"
            >
              {loading ? 'Envoi...' : 'Envoyer'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
