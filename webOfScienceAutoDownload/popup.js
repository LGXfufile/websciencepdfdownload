const { createApp, ref } = Vue;

createApp({
  setup() {
    const loading = ref(false);
    const status = ref('Ready to download');

    const downloadSingle = async () => {
      loading.value = true;
      status.value = 'Processing...';
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'downloadSingle' });
        status.value = response.message;
      } catch (error) {
        status.value = 'Error: ' + error.message;
      } finally {
        loading.value = false;
      }
    };

    const downloadBulk = async () => {
      loading.value = true;
      status.value = 'Processing bulk download...';
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'downloadBulk' });
        status.value = response.message;
      } catch (error) {
        status.value = 'Error: ' + error.message;
      } finally {
        loading.value = false;
      }
    };

    return {
      loading,
      status,
      downloadSingle,
      downloadBulk
    };
  }
}).use(ElementPlus).mount('#app'); 