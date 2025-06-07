// Install prompt handling
self.addEventListener('beforeinstallprompt', (event) => {
  console.log('📱 Install prompt available');
  event.preventDefault();
  
  // Send to main app
  self.clients.matchAll().then((clientList) => {
    if (clientList.length > 0) {
      clientList[0].postMessage({
        type: 'INSTALL_PROMPT_AVAILABLE',
        event: event
      });
    }
  });
});

// App installed
self.addEventListener('appinstalled', (event) => {
  console.log('🎉 GoWalking PWA installed successfully!');
  
  // Track installation
  self.clients.matchAll().then((clientList) => {
    if (clientList.length > 0) {
      clientList[0].postMessage({
        type: 'APP_INSTALLED'
      });
    }
  });
});