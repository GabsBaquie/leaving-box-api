# Détection des retours en arrière des opérateurs

## ⚠️ IMPORTANT

**Le backend ne peut PAS détecter automatiquement les retours en arrière du navigateur.**  
Le client DOIT envoyer un événement WebSocket quand un retour en arrière est détecté.

## Comment ça fonctionne

Le backend peut détecter les retours en arrière des opérateurs de deux façons :

1. **Détection explicite** : Le client envoie directement l'événement `operatorBackNavigation` ou `back`
2. **Détection automatique** : Le backend compare les actions de navigation (nécessite que le client envoie `operatorAction` ou `getSession` avec `currentPath`)

## Événements WebSocket

### Côté client (opérateur)

#### 1. Signaler un retour en arrière explicitement (RECOMMANDÉ)

**Option simple (juste le sessionCode) :**
```typescript
// Quand l'utilisateur fait un retour en arrière dans le navigateur
socket.emit('back', {
  sessionCode: 'ABC123'
});

// OU avec plus de détails
socket.emit('operatorBackNavigation', {
  sessionCode: 'ABC123',
  path: window.location.pathname, // Optionnel
  state: 'previous-state' // Optionnel
});
```

**Exemple complet avec détection automatique :**
```typescript
// Dans votre composant React/Next.js
useEffect(() => {
  // Détecter les retours en arrière du navigateur
  const handlePopState = () => {
    socket.emit('back', { sessionCode: 'ABC123' });
  };

  window.addEventListener('popstate', handlePopState);
  
  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
}, [sessionCode]);
```

#### 2. Enregistrer une action de navigation (pour détection automatique)

```typescript
// À chaque navigation, enregistrer l'action
socket.emit('operatorAction', {
  sessionCode: 'ABC123',
  action: 'navigate',
  data: {
    path: window.location.pathname,
    state: 'viewing-module-1',
    url: window.location.href
  }
});
```

#### 3. Utiliser getSession avec currentPath (détection automatique)

```typescript
// Quand vous récupérez la session, inclure le chemin actuel
socket.emit('getSession', {
  sessionCode: 'ABC123',
  currentPath: window.location.pathname // Permet la détection automatique
});
```

### Côté client (agent)

#### Écouter les retours en arrière

```typescript
socket.on('operatorBackNavigation', (data) => {
  console.log('Un opérateur a fait retour en arrière:', data);
  // data: {
  //   sessionCode: string,
  //   operatorId: string,
  //   operatorLabel: string,
  //   timestamp: Date,
  //   path?: string,
  //   state?: string,
  //   autoDetected?: boolean
  // }
});
```

## Exemple d'implémentation côté client (React/Next.js)

```typescript
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { socket } from '@/lib/socket';

export const useBackNavigationDetection = (sessionCode: string) => {
  const router = useRouter();

  useEffect(() => {
    if (!sessionCode || !socket) return;

    // Écouter les événements popstate (retour en arrière du navigateur)
    const handlePopState = (event: PopStateEvent) => {
      console.log('Back navigation detected via popstate');
      
      // Envoyer l'événement au backend
      socket.emit('operatorBackNavigation', {
        sessionCode,
        path: window.location.pathname,
        state: event.state,
      });
    };

    // Écouter les changements de route
    const handleRouteChange = (url: string) => {
      // Enregistrer chaque navigation
      socket.emit('operatorAction', {
        sessionCode,
        action: 'navigate',
        data: {
          path: url,
          url: window.location.href,
        },
      });
    };

    // Ajouter les listeners
    window.addEventListener('popstate', handlePopState);
    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [sessionCode, router]);
};
```

## Exemple d'implémentation côté client (Vanilla JS)

```javascript
// Détecter les retours en arrière avec l'API History
(function() {
  let lastUrl = window.location.href;
  
  // Écouter les changements d'URL
  window.addEventListener('popstate', function(event) {
    const currentUrl = window.location.href;
    
    // Si l'URL actuelle est différente de la dernière, c'est un retour en arrière
    if (currentUrl !== lastUrl) {
      console.log('Back navigation detected');
      
      // Envoyer l'événement au backend
      socket.emit('operatorBackNavigation', {
        sessionCode: 'ABC123', // À récupérer depuis votre état
        path: window.location.pathname,
        state: event.state,
      });
    }
    
    lastUrl = currentUrl;
  });
  
  // Enregistrer chaque navigation
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    
    socket.emit('operatorAction', {
      sessionCode: 'ABC123',
      action: 'navigate',
      data: {
        path: window.location.pathname,
        url: window.location.href,
      },
    });
  };
})();
```

## Dépannage

### Le retour en arrière n'est pas détecté

**⚠️ PROBLÈME LE PLUS COURANT : Le client n'envoie pas l'événement**

1. **Vérifier que le client envoie l'événement** :
   - Ouvrir la console du navigateur (F12)
   - Vérifier que `socket.emit('back', ...)` ou `socket.emit('operatorBackNavigation', ...)` est appelé
   - Ajouter un listener pour détecter les retours en arrière :
     ```javascript
     window.addEventListener('popstate', () => {
       console.log('Back navigation detected!');
       socket.emit('back', { sessionCode: 'VOTRE_CODE' });
     });
     ```

2. **Vérifier les logs du serveur** :
   - Le serveur log `🔙 operatorBackNavigation received` quand l'événement est reçu
   - Le serveur log `Back navigation notified to agent` quand l'agent est notifié
   - Si l'agent n'est pas connecté, vous verrez `Agent not connected`
   - Si vous ne voyez AUCUN log, c'est que le client n'envoie pas l'événement

3. **Vérifier que l'agent écoute l'événement** :
   ```typescript
   socket.on('operatorBackNavigation', (data) => {
     console.log('Received:', data);
   });
   ```

### Test rapide

Pour tester si le système fonctionne, depuis la console du navigateur (côté opérateur) :
```javascript
socket.emit('back', { sessionCode: 'VOTRE_CODE_SESSION' });
```

Vous devriez voir dans les logs du serveur :
```
🔙 operatorBackNavigation received { sessionCode: '...', operatorId: '...', ... }
Back navigation notified to agent { ... }
```

### Logs de débogage

Le backend log automatiquement :
- Quand un événement `operatorBackNavigation` est reçu
- Quand l'agent est notifié
- Si l'agent n'est pas connecté
- Les détails de chaque retour en arrière détecté

## Notes importantes

- Le backend **ne peut pas** détecter automatiquement les retours en arrière du navigateur sans que le client envoie un événement
- Il faut implémenter la détection côté client en écoutant `popstate` ou en interceptant `history.back()`
- La détection automatique fonctionne seulement si vous enregistrez les actions de navigation avec `operatorAction`