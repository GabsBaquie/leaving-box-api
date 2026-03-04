# Dépannage WebSocket - React Native/Expo

## Problèmes courants de connexion WebSocket

### 1. Erreur "websocket error" depuis React Native/Expo

#### Vérifications côté serveur

1. **Le serveur écoute bien sur toutes les interfaces** :
   ```typescript
   // Dans main.ts
   await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
   ```

2. **Configuration CORS du Gateway** :
   ```typescript
   @WebSocketGateway({
     cors: {
       origin: '*',
       methods: ['GET', 'POST'],
       allowedHeaders: ['*'],
       credentials: true,
     },
     transports: ['websocket', 'polling'],
     allowEIO3: true,
   })
   ```

#### Vérifications côté client (React Native/Expo)

1. **URL correcte** :
   ```typescript
   // Pour un appareil physique ou émulateur Android
   const WEBSOCKET_URL = 'http://10.0.2.2:3000'; // Android Emulator
   // ou
   const WEBSOCKET_URL = 'http://192.168.1.X:3000'; // IP locale de votre machine
   
   // Pour iOS Simulator
   const WEBSOCKET_URL = 'http://localhost:3000';
   
   // Pour un appareil physique (iOS/Android)
   const WEBSOCKET_URL = 'http://VOTRE_IP_LOCALE:3000';
   ```

2. **Configuration Socket.IO client** :
   ```typescript
   import { io } from 'socket.io-client';
   
   const socket = io(WEBSOCKET_URL, {
     transports: ['websocket', 'polling'],
     reconnection: true,
     reconnectionAttempts: 5,
     reconnectionDelay: 1000,
     timeout: 20000,
   });
   ```

3. **Permissions réseau (Android)** :
   Dans `AndroidManifest.xml` :
   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
   ```

### 2. Comment trouver votre IP locale

#### Sur macOS/Linux :
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

#### Sur Windows :
```bash
ipconfig
```

Cherchez l'adresse IPv4 de votre interface réseau (généralement `192.168.x.x` ou `10.0.x.x`).

### 3. Configuration recommandée pour Expo

```typescript
// core/api/session.api.tsx
import { io, Socket } from 'socket.io-client';

const getWebSocketUrl = () => {
  // En développement
  if (__DEV__) {
    // Android Emulator
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000';
    }
    // iOS Simulator
    if (Platform.OS === 'ios') {
      return 'http://localhost:3000';
    }
    // Appareil physique - utilisez votre IP locale
    return 'http://192.168.1.X:3000'; // Remplacez X par votre IP
  }
  
  // En production
  return process.env.EXPO_PUBLIC_WEBSOCKET_URL || 'https://votre-serveur.com';
};

export const socket: Socket = io(getWebSocketUrl(), {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  forceNew: true,
});

socket.on('connect', () => {
  console.log('✅ Connecté au serveur WebSocket:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Erreur de connexion WebSocket:', error.message);
  console.error('Vérifiez que:');
  console.error('1. Le serveur est démarré sur le port 3000');
  console.error('2. EXPO_PUBLIC_WEBSOCKET_URL est correctement défini');
  console.error('3. L\'URL est accessible depuis votre appareil/réseau');
  console.error('4. Le firewall n\'bloque pas le port 3000');
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Déconnecté:', reason);
});
```

### 4. Test de connexion

#### Test depuis le terminal (curl)
```bash
# Vérifier que le serveur répond
curl http://localhost:3000

# Tester la connexion WebSocket (nécessite wscat)
npm install -g wscat
wscat -c ws://localhost:3000
```

#### Test depuis le navigateur
```javascript
// Dans la console du navigateur
const socket = io('http://localhost:3000');
socket.on('connect', () => console.log('Connecté:', socket.id));
```

### 5. Problèmes spécifiques

#### Android Emulator
- Utilisez `10.0.2.2` au lieu de `localhost`
- Vérifiez que le port forwarding est activé

#### iOS Simulator
- Utilisez `localhost` normalement
- Vérifiez que le serveur écoute sur `0.0.0.0`

#### Appareil physique
- Utilisez l'IP locale de votre machine (pas `localhost`)
- Vérifiez que l'appareil et la machine sont sur le même réseau WiFi
- Vérifiez le firewall de votre machine

### 6. Variables d'environnement (.env)

```env
# .env
EXPO_PUBLIC_WEBSOCKET_URL=http://192.168.1.X:3000
```

**Important** : Les variables `EXPO_PUBLIC_*` sont accessibles côté client dans Expo.

### 7. Debug avancé

```typescript
socket.on('connect', () => {
  console.log('✅ Connecté');
  console.log('Socket ID:', socket.id);
  console.log('Transport:', socket.io.engine.transport.name);
});

socket.io.on('reconnect_attempt', () => {
  console.log('🔄 Tentative de reconnexion...');
});

socket.io.on('reconnect', (attemptNumber) => {
  console.log('✅ Reconnecté après', attemptNumber, 'tentatives');
});

socket.io.on('reconnect_error', (error) => {
  console.error('❌ Erreur de reconnexion:', error);
});

socket.io.on('reconnect_failed', () => {
  console.error('❌ Échec de reconnexion après toutes les tentatives');
});
```

### 8. Vérification du serveur

Assurez-vous que le serveur affiche bien :
```
[Nest] LOG [NestApplication] Nest application successfully started
[WebSocketsController] SessionsGateway subscribed to the "createSession" message
```

Si ces logs n'apparaissent pas, le serveur WebSocket n'est pas correctement initialisé.

### 9. Solution rapide

1. **Redémarrer le serveur** :
   ```bash
   npm run start:dev
   ```

2. **Vérifier le port** :
   ```bash
   lsof -i :3000  # macOS/Linux
   netstat -ano | findstr :3000  # Windows
   ```

3. **Tester avec un client simple** :
   ```typescript
   // Test minimal
   const socket = io('http://VOTRE_IP:3000', {
     transports: ['websocket'],
   });
   
   socket.on('connect', () => {
     console.log('OK');
     socket.emit('createSession', {
       difficulty: 'Easy',
       role: 'agent'
     });
   });
   ```

### 10. Checklist de dépannage

- [ ] Le serveur est démarré et écoute sur le port 3000
- [ ] Le serveur écoute sur `0.0.0.0` (pas seulement `localhost`)
- [ ] L'URL WebSocket est correcte (IP locale pour appareil physique)
- [ ] Le firewall n'bloque pas le port 3000
- [ ] L'appareil et le serveur sont sur le même réseau
- [ ] Les transports `['websocket', 'polling']` sont configurés
- [ ] La variable `EXPO_PUBLIC_WEBSOCKET_URL` est définie (si utilisée)
- [ ] Les permissions réseau sont activées (Android)
