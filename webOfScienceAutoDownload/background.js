// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === 'openArticle') {
    chrome.tabs.create({ url: request.url }, (tab) => {
      sendResponse({ id: tab.id });
    });
    return true;
  }

  if (request.action === 'getDOI') {
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      func: () => {
        // 尝试多种方式获取DOI
        const doiElement = document.querySelector('#FullRTa-DOI') || 
                         document.querySelector('[data-doi]') ||
                         document.querySelector('[data-ta="record-DOI"]');
        
        if (doiElement) {
          const doi = doiElement.getAttribute('data-doi') || doiElement.textContent.trim();
          return { doi };
        }
        
        // 在页面内容中搜索DOI
        const doiRegex = /10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/gi;
        const pageText = document.body.textContent;
        const matches = pageText.match(doiRegex);
        
        if (matches && matches.length > 0) {
          return { doi: matches[0] };
        }
        
        return { doi: null };
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError });
        return;
      }
      sendResponse(results[0].result);
    });
    return true;
  }

  if (request.action === 'closeTab') {
    chrome.tabs.remove(request.tabId, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'openSciHub') {
    console.log('正在打开Sci-Hub页面:', request.url);
    try {
      chrome.tabs.create({ url: request.url }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('创建标签页时出错:', chrome.runtime.lastError);
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        console.log('Sci-Hub标签页已创建, ID:', tab.id);
        sendResponse(tab);
      });
    } catch (error) {
      console.error('处理openSciHub请求时出错:', error);
      sendResponse({ error: error.message });
    }
    return true;
  }

  // 添加一个Map来跟踪正在下载的文件
  const downloadingFiles = new Map();

  if (request.action === 'clickDownload') {
    console.log('开始处理下载按钮点击, 标签页ID:', request.tabId);
    
    try {
      // 检查是否正在下载
      const fileId = request.url || request.tabId.toString();
      if (downloadingFiles.has(fileId)) {
        console.log('该文件正在下载中，避免重复下载:', fileId);
        sendResponse({ success: false, error: '文件正在下载中' });
        return true;
      }
      
      // 标记文件正在下载
      downloadingFiles.set(fileId, Date.now());
      
      // 设置超时自动清理
      setTimeout(() => {
        if (downloadingFiles.has(fileId)) {
          downloadingFiles.delete(fileId);
          console.log('清理超时的下载记录:', fileId);
        }
      }, 30000); // 30秒后自动清理

      chrome.scripting.executeScript({
        target: { tabId: request.tabId },
        function: (url) => {
          console.log('开始执行下载按钮点击脚本');
          console.log('目标URL:', url);
          
          // 等待页面加载完成
          return new Promise((resolve) => {
            let clickAttempts = 0;
            const maxAttempts = 3;
            
            const checkDownloadButton = () => {
              console.log('检查下载按钮...');
              clickAttempts++;
              
              try {
                // 1. 首先查找buttons容器
                const buttonsContainer = document.getElementById('buttons');
                if (buttonsContainer) {
                  console.log('找到buttons容器:', buttonsContainer);
                  
                  // 2. 在容器中查找下载按钮
                  const downloadButton = buttonsContainer.querySelector('button');
                  if (downloadButton) {
                    console.log('找到下载按钮:', downloadButton);
                    console.log('按钮文本:', downloadButton.textContent);
                    console.log('尝试点击下载按钮...');
                    
                    // 防止重复点击
                    if (downloadButton.getAttribute('data-clicked') === 'true') {
                      console.log('按钮已被点击过，避免重复点击');
                      return resolve({ success: false, error: '按钮已被点击' });
                    }
                    
                    // 标记按钮已被点击
                    downloadButton.setAttribute('data-clicked', 'true');
                    downloadButton.click();
                    return resolve({ success: true, source: 'buttons_container' });
                  }
                }

                // 3. 如果没有找到buttons容器或下载按钮，检查是否有直接的PDF嵌入
                const pdfViewer = document.querySelector('embed[type="application/pdf"]');
                if (pdfViewer) {
                  console.log('找到PDF查看器');
                  const pdfUrl = pdfViewer.src;
                  if (pdfUrl) {
                    console.log('找到PDF URL:', pdfUrl);
                    window.location.href = pdfUrl;
                    return resolve({ success: true, source: 'pdf_viewer' });
                  }
                }

                // 4. 查找页面中的PDF链接
                const pdfLinks = document.querySelectorAll('a[href*=".pdf"]');
                for (const link of pdfLinks) {
                  if (link.href) {
                    console.log('找到PDF链接:', link.href);
                    window.location.href = link.href;
                    return resolve({ success: true, source: 'pdf_link' });
                  }
                }

                if (clickAttempts >= maxAttempts) {
                  console.log('达到最大尝试次数');
                  return resolve({ success: false, error: '达到最大尝试次数' });
                }
              } catch (error) {
                console.error('检查下载按钮时出错:', error);
                return resolve({ success: false, error: error.message });
              }
            };
            
            // 初始检查
            console.log('执行初始检查...');
            checkDownloadButton();
            
            // 设置定时检查
            console.log('设置定时检查...');
            const checkInterval = setInterval(() => {
              console.log('执行定时检查...');
              const result = checkDownloadButton();
              if (result && result.success) {
                console.log('定时检查成功');
                clearInterval(checkInterval);
              }
            }, 1000);
            
            // 设置超时
            setTimeout(() => {
              console.log('检查下载按钮超时');
              clearInterval(checkInterval);
              resolve({ success: false, error: '检查下载按钮超时' });
            }, 15000);
          });
        },
        args: [request.url]
      }, (results) => {
        // 清理下载记录
        downloadingFiles.delete(fileId);
        
        if (chrome.runtime.lastError) {
          console.error('执行脚本时出错:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        console.log('下载按钮点击脚本执行结果:', results);
        if (results && results[0]) {
          console.log('详细结果:', results[0].result);
          sendResponse(results[0].result);
        } else {
          console.log('未收到执行结果');
          sendResponse({ success: false, error: '未收到执行结果' });
        }
      });
    } catch (error) {
      // 发生错误时也要清理下载记录
      downloadingFiles.delete(fileId);
      console.error('处理clickDownload请求时出错:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (request.action === 'getDOIFromNewTab') {
    console.log('正在新标签页中获取DOI...');
    
    // 创建一个Promise来处理异步操作
    const getDOIPromise = new Promise(async (resolve) => {
      try {
        // 创建新标签页
        const tab = await chrome.tabs.create({ 
          url: request.url,
          active: false // 在后台打开标签页
        });
        
        console.log('文章页面已在新标签页中打开，等待加载完成...');
        
        // 设置重试参数
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = 1000;
        
        // 创建一个函数来检查DOI
        const checkForDOI = async () => {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                // 尝试查找DOI元素
                const doiElement = document.querySelector('#FullRTa-DOI');
                if (doiElement) {
                  return { 
                    success: true, 
                    doi: doiElement.textContent.trim()
                  };
                }
                return { success: false };
              }
            });
            
            // 检查结果
            if (results && results[0] && results[0].result.success) {
              console.log('成功获取DOI:', results[0].result.doi);
              return results[0].result;
            }
          } catch (error) {
            console.log('检查DOI时出错:', error);
          }
          return { success: false };
        };
        
        // 开始重试循环
        while (retryCount < maxRetries) {
          console.log(`尝试获取DOI (${retryCount + 1}/${maxRetries})...`);
          
          const result = await checkForDOI();
          if (result.success) {
            // 关闭标签页
            await chrome.tabs.remove(tab.id);
            resolve(result);
            return;
          }
          
          // 等待后重试
          await new Promise(r => setTimeout(r, retryInterval));
          retryCount++;
        }
        
        // 如果所有重试都失败了
        await chrome.tabs.remove(tab.id);
        resolve({ 
          success: false, 
          error: '无法在页面中找到DOI元素' 
        });
      } catch (error) {
        console.error('获取DOI过程中出错:', error);
        resolve({ 
          success: false, 
          error: error.message 
        });
      }
    });
    
    // 执行Promise并发送响应
    getDOIPromise.then(result => {
      sendResponse(result);
    });
    
    return true; // 保持消息通道开放
  }
});

// Handle extension updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('扩展安装/更新:', details);
  if (details.reason === 'update') {
    console.log('正在重新加载匹配的标签页...');
    try {
      // Reload all tabs that match our content script
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error('查询标签页时出错:', chrome.runtime.lastError);
          return;
        }
        
        console.log('找到标签页数量:', tabs.length);
        tabs.forEach((tab) => {
          if (tab.url.includes('webofscience-clarivate-cn-443.webvpn.zisu.edu.cn')) {
            console.log('重新加载标签页:', tab.id);
            chrome.tabs.reload(tab.id);
          }
        });
      });
    } catch (error) {
      console.error('处理扩展更新时出错:', error);
    }
  }
}); 