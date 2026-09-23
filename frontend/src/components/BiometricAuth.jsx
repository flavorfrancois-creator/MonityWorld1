import React, { useState, useEffect } from 'react';
import API from '../utils/api';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { 
  Fingerprint, Smartphone, Shield, Check, X, Plus, Trash2, AlertTriangle,
  ScanFace, Key, RefreshCw
} from 'lucide-react';

// Check if WebAuthn is supported
const isWebAuthnSupported = () => {
  return window.PublicKeyCredential !== undefined;
};

// Check if platform authenticator is available (Touch ID, Face ID, Windows Hello)
const isPlatformAuthenticatorAvailable = async () => {
  if (!isWebAuthnSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

// Base64URL encoding/decoding utilities
const base64UrlToBuffer = (base64url) => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};

const bufferToBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

export default function BiometricAuth({ onSuccess, mode = 'settings' }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [supported, setSupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [credentialName, setCredentialName] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    checkSupport();
    if (mode === 'settings') {
      fetchStatus();
    }
  }, [mode]);

  const checkSupport = async () => {
    const webauthn = isWebAuthnSupported();
    setSupported(webauthn);
    if (webauthn) {
      const platform = await isPlatformAuthenticatorAvailable();
      setPlatformAvailable(platform);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await API.get('/auth/biometric/status');
      setStatus(res.data);
    } catch (e) {
      console.error('Error fetching biometric status:', e);
    }
  };

  const registerBiometric = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get registration options from server
      const optionsRes = await API.post('/auth/biometric/register/options');
      const options = optionsRes.data;
      
      // Prepare credential creation options
      const publicKeyCredentialCreationOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        rp: options.rp,
        user: {
          id: base64UrlToBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        excludeCredentials: options.excludeCredentials.map(c => ({
          ...c,
          id: base64UrlToBuffer(c.id)
        })),
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation
      };
      
      // Create credential using browser API
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      });
      
      // Send credential to server for verification
      const verifyRes = await API.post('/auth/biometric/register/verify', {
        id: credential.id,
        rawId: bufferToBase64Url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
          attestationObject: bufferToBase64Url(credential.response.attestationObject),
          transports: credential.response.getTransports ? credential.response.getTransports() : []
        },
        type: credential.type,
        name: credentialName || 'Mon appareil'
      });
      
      if (verifyRes.data.success) {
        setShowSetup(false);
        setCredentialName('');
        fetchStatus();
      }
      
    } catch (e) {
      console.error('Biometric registration error:', e);
      if (e.name === 'NotAllowedError') {
        setError('L\'enregistrement a été annulé ou refusé');
      } else if (e.name === 'SecurityError') {
        setError('Erreur de sécurité. Assurez-vous d\'être sur HTTPS');
      } else {
        setError(e.response?.data?.detail || e.message || 'Erreur lors de l\'enregistrement');
      }
    }
    
    setLoading(false);
  };

  const authenticateWithBiometric = async (phone) => {
    setLoading(true);
    setError(null);
    
    try {
      // Get authentication options
      const optionsRes = await API.post('/auth/biometric/authenticate/options', null, {
        params: { phone }
      });
      const options = optionsRes.data;
      
      // Prepare authentication options
      const publicKeyCredentialRequestOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        timeout: options.timeout,
        rpId: options.rpId,
        allowCredentials: options.allowCredentials.map(c => ({
          ...c,
          id: base64UrlToBuffer(c.id)
        })),
        userVerification: options.userVerification
      };
      
      // Get credential from browser
      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      });
      
      // Verify with server
      const verifyRes = await API.post('/auth/biometric/authenticate/verify', {
        user_id: options.user_id,
        id: credential.id,
        rawId: bufferToBase64Url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
          authenticatorData: bufferToBase64Url(credential.response.authenticatorData),
          signature: bufferToBase64Url(credential.response.signature),
          userHandle: credential.response.userHandle ? bufferToBase64Url(credential.response.userHandle) : null
        },
        type: credential.type
      });
      
      if (onSuccess) {
        onSuccess(verifyRes.data);
      }
      
    } catch (e) {
      console.error('Biometric authentication error:', e);
      if (e.name === 'NotAllowedError') {
        setError('Authentification annulée ou refusée');
      } else {
        setError(e.response?.data?.detail || e.message || 'Erreur lors de l\'authentification');
      }
    }
    
    setLoading(false);
  };

  const deleteCredential = async (credentialId) => {
    if (!window.confirm('Supprimer cette méthode biométrique ?')) return;
    
    try {
      await API.delete(`/auth/biometric/credential/${credentialId}`);
      fetchStatus();
    } catch (e) {
      console.error('Error deleting credential:', e);
    }
  };

  // Login mode - just show authentication button
  if (mode === 'login') {
    return (
      <div className="space-y-3">
        {!supported ? (
          <p className="text-sm text-muted-foreground text-center">
            Votre navigateur ne supporte pas l'authentification biométrique
          </p>
        ) : !platformAvailable ? (
          <p className="text-sm text-muted-foreground text-center">
            Aucun authentificateur biométrique disponible
          </p>
        ) : (
          <>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => authenticateWithBiometric(window.biometricPhone)}
              disabled={loading}
              data-testid="biometric-login-btn"
            >
              {loading ? (
                <RefreshCw size={16} className="mr-2 animate-spin" />
              ) : (
                <Fingerprint size={16} className="mr-2" />
              )}
              Se connecter avec biométrie
            </Button>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
          </>
        )}
      </div>
    );
  }

  // Settings mode - full management UI
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="text-primary" />
          Authentification Biométrique
        </CardTitle>
        <CardDescription>
          Utilisez Face ID, Touch ID ou Windows Hello pour vous connecter plus rapidement
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg">
            <AlertTriangle className="text-destructive" />
            <div>
              <p className="font-medium">Non supporté</p>
              <p className="text-sm text-muted-foreground">
                Votre navigateur ne supporte pas WebAuthn
              </p>
            </div>
          </div>
        ) : !platformAvailable ? (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 rounded-lg">
            <AlertTriangle className="text-yellow-500" />
            <div>
              <p className="font-medium">Appareil non compatible</p>
              <p className="text-sm text-muted-foreground">
                Aucun capteur biométrique détecté sur cet appareil
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Status */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                {status?.enabled ? (
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="text-green-500" size={20} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Key className="text-muted-foreground" size={20} />
                  </div>
                )}
                <div>
                  <p className="font-medium">
                    {status?.enabled ? 'Activé' : 'Non configuré'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {status?.credentials_count || 0} appareil(s) enregistré(s)
                  </p>
                </div>
              </div>
              <Button
                variant={status?.enabled ? 'outline' : 'default'}
                size="sm"
                onClick={() => setShowSetup(true)}
                data-testid="add-biometric-btn"
              >
                <Plus size={16} className="mr-1" />
                Ajouter
              </Button>
            </div>

            {/* Registered credentials */}
            {status?.credentials?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Appareils enregistrés</p>
                {status.credentials.map((cred, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Smartphone className="text-muted-foreground" size={18} />
                      <div>
                        <p className="text-sm font-medium">{cred.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Ajouté le {new Date(cred.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteCredential(cred.id)}
                      data-testid={`delete-credential-${idx}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Required badge */}
            {status?.is_required && (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-lg">
                <Shield className="text-yellow-500" size={18} />
                <p className="text-sm">
                  L'authentification biométrique est <strong>obligatoire</strong> pour votre rôle ({status.user_role})
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Setup Dialog */}
      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace size={20} />
              Configurer la biométrie
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Utilisez votre empreinte digitale ou reconnaissance faciale pour vous connecter rapidement et en toute sécurité.
            </p>
            
            <div>
              <label className="text-sm font-medium">Nom de l'appareil (optionnel)</label>
              <input
                type="text"
                className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg"
                placeholder="Ex: iPhone de Jean"
                value={credentialName}
                onChange={(e) => setCredentialName(e.target.value)}
                data-testid="credential-name-input"
              />
            </div>
            
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetup(false)}>
              Annuler
            </Button>
            <Button onClick={registerBiometric} disabled={loading} data-testid="confirm-biometric-btn">
              {loading ? (
                <RefreshCw size={16} className="mr-2 animate-spin" />
              ) : (
                <Fingerprint size={16} className="mr-2" />
              )}
              Activer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Export helper for login page
export const BiometricLoginButton = ({ phone, onSuccess }) => {
  // Store phone for the component to use
  if (typeof window !== 'undefined') {
    window.biometricPhone = phone;
  }
  
  return <BiometricAuth mode="login" onSuccess={onSuccess} />;
};
