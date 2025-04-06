// 全局重试计数器
let globalRetryCount = 0;
const MAX_GLOBAL_RETRIES = 3;

// Process paper download
async function processPaperDownload(paperUrl) {
  try {
    console.log('开始处理文章下载...');
    console.log('文章URL:', paperUrl);
    
    // 检查全局重试次数
    if (globalRetryCount >= MAX_GLOBAL_RETRIES) {
      console.error('已达到最大重试次数限制');
      throw new Error('已达到最大重试次数限制，请稍后再试');
    }

    // Step 1: 在新标签页中获取DOI
    console.log('正在获取DOI...');
    const doiResult = await chrome.runtime.sendMessage({
      action: 'getDOIFromNewTab',
      url: paperUrl
    });

    if (!doiResult.success || !doiResult.doi) {
      throw new Error(doiResult.error || '无法获取文章DOI');
    }

    const doi = doiResult.doi;
    console.log('成功获取DOI:', doi);
    
    // Step 2: Construct Sci-Hub URL
    const sciHubUrl = `https://sci-hub.se/${doi}`;
    console.log('构建Sci-Hub URL:', sciHubUrl);
    
    // Step 3: Open Sci-Hub page in new tab
    console.log('正在打开Sci-Hub页面...');
    const tab = await chrome.runtime.sendMessage({
      action: 'openSciHub',
      url: sciHubUrl
    });
    console.log('Sci-Hub标签页ID:', tab.id);

    // Step 4: Wait for page to load and click download button
    console.log('等待Sci-Hub页面加载...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // 增加等待时间到10秒
    
    console.log('尝试点击下载按钮...');
    const downloadResult = await chrome.runtime.sendMessage({
      action: 'clickDownload',
      tabId: tab.id,
      url: sciHubUrl
    });
    console.log('下载按钮点击结果:', downloadResult);

    if (!downloadResult.success) {
      globalRetryCount++;
      console.log(`下载失败，当前重试次数: ${globalRetryCount}/${MAX_GLOBAL_RETRIES}`);
      throw new Error('该文章在Sci-Hub数据库中未找到');
    }

    // 下载成功，重置重试计数器
    globalRetryCount = 0;
    console.log('下载开始成功');
    return { success: true, message: '下载已开始' };
  } catch (error) {
    console.error('下载过程出错:', error);
    return { success: false, message: error.message };
  }
}

// Create download buttons
function createDownloadButtons() {
  console.log('开始创建下载按钮...');
  
  try {
    // 检查是否已存在按钮
    const existingButtons = document.querySelectorAll('.wos-download-btn');
    if (existingButtons.length > 0) {
      console.log('下载按钮已存在，跳过创建');
      return;
    }

    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'wos-download-container';
    buttonContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    // 创建单个下载按钮
    const singleDownloadBtn = document.createElement('button');
    singleDownloadBtn.id = 'wos-single-download';
    singleDownloadBtn.className = 'wos-download-btn';
    singleDownloadBtn.innerHTML = '下载选中';
    singleDownloadBtn.style.cssText = `
      padding: 8px 16px;
      background-color: #409EFF;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
    `;
    console.log('单个下载按钮创建完成');

    // 创建批量下载按钮
    const batchDownloadBtn = document.createElement('button');
    batchDownloadBtn.id = 'wos-batch-download';
    batchDownloadBtn.className = 'wos-download-btn';
    batchDownloadBtn.innerHTML = '批量下载';
    batchDownloadBtn.style.cssText = `
      padding: 8px 16px;
      background-color: #67C23A;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
    `;
    console.log('批量下载按钮创建完成');

    // 添加按钮到容器
    buttonContainer.appendChild(singleDownloadBtn);
    buttonContainer.appendChild(batchDownloadBtn);
    
    // 添加容器到页面
    document.body.appendChild(buttonContainer);
    console.log('按钮已添加到页面');

    // 使用事件委托处理点击事件
    buttonContainer.addEventListener('click', async (event) => {
      console.log('按钮容器被点击:', event.target.id);
      
      if (event.target.id === 'wos-single-download') {
        console.log('=== 单个下载按钮被点击 ===');
        try {
          // 1. 查找选中的复选框
          const selectedCheckboxes = document.querySelectorAll('input[type="checkbox"].mat-checkbox-input:checked');
          console.log('=== 开始下载流程 ===');
          console.log('【步骤1】选中的复选框数量:', selectedCheckboxes.length);
          console.log('选中的复选框元素:', selectedCheckboxes);
          console.log('第一个复选框HTML:', selectedCheckboxes[0]?.outerHTML || '未找到');
          
          if (selectedCheckboxes.length === 0) {
            console.log('❌ 没有选中任何文章');
            alert('请先选择要下载的文章');
            return;
          }

          // 2. 获取第一个选中的复选框
          const selectedCheckbox = selectedCheckboxes[0];
          console.log('\n【步骤2】获取选中的复选框');
          console.log('复选框元素:', selectedCheckbox);
          console.log('复选框HTML:', selectedCheckbox.outerHTML);
          console.log('复选框父元素:', selectedCheckbox.parentElement?.outerHTML || '无父元素');

          // 3. 查找文章容器和链接
          console.log('\n【步骤3】查找文章容器');
          
          // 从复选框开始向上查找到包含文章信息的容器
          const articleContainer = selectedCheckbox.closest('.summary-record');
          if (!articleContainer) {
            console.log('❌ 未找到文章容器(.summary-record)');
            console.log('当前元素的父级结构:');
            let parent = selectedCheckbox.parentElement;
            let level = 1;
            while (parent && level <= 5) {
              console.log(`第${level}层父元素:`, parent.outerHTML);
              parent = parent.parentElement;
              level++;
            }
            throw new Error('未找到文章容器');
          }
          console.log('✅ 找到文章容器:', articleContainer);
          console.log('文章容器HTML:', articleContainer.outerHTML);

          // 4. 在文章容器中查找标题链接
          console.log('\n【步骤4】查找文章链接');
          console.log('尝试查找选择器: a[data-ta="summary-record-title-link"]');
          const articleLink = articleContainer.querySelector('a[data-ta="summary-record-title-link"]');
          
          if (!articleLink) {
            console.log('❌ 未找到文章链接元素');
            console.log('文章容器中的所有链接:');
            const allLinks = articleContainer.querySelectorAll('a');
            Array.from(allLinks).forEach((link, index) => {
              console.log(`链接${index + 1}:`, {
                html: link.outerHTML,
                href: link.href,
                'data-ta': link.getAttribute('data-ta'),
                text: link.textContent.trim()
              });
            });
            throw new Error('未找到文章链接');
          }

          if (!articleLink.href) {
            console.log('❌ 找到链接元素但没有href属性');
            console.log('链接元素:', {
              html: articleLink.outerHTML,
              'data-ta': articleLink.getAttribute('data-ta'),
              text: articleLink.textContent.trim()
            });
            throw new Error('文章链接无效');
          }

          console.log('✅ 找到文章链接:', {
            href: articleLink.href,
            'data-ta': articleLink.getAttribute('data-ta'),
            text: articleLink.textContent.trim()
          });

          // 5. 处理下载
          console.log('\n【步骤5】开始处理下载...');
          const result = await processPaperDownload(articleLink.href);
          
          if (!result.success) {
            throw new Error(result.message);
          }
        } catch (error) {
          console.error('❌ 处理下载时出错:', error);
          alert('处理下载时出错: ' + error.message);
        }
      } else if (event.target.id === 'wos-batch-download') {
        console.log('=== 批量下载按钮被点击 ===');
        try {
          const selectedCheckboxes = document.querySelectorAll('input.mat-checkbox-input.cdk-visually-hidden[type="checkbox"]:checked');
          console.log('【批量】选中的复选框数量:', selectedCheckboxes.length);
          
          if (selectedCheckboxes.length === 0) {
            console.log('❌ 没有选中任何文章');
            alert('请先选择要下载的文章');
            return;
          }

          // 批量处理选中的文章
          for (const checkbox of selectedCheckboxes) {
            try {
              console.log('【批量】处理新的文章...');
              const articleContainer = checkbox.closest('.summary-record');
              if (articleContainer) {
                console.log('找到文章容器');
                
                // 在文章容器中查找标题链接
                const articleLink = articleContainer.querySelector('a[data-ta="summary-record-title-link"]');
                if (articleLink && articleLink.href) {
                  console.log('【批量】找到文章链接:', {
                    href: articleLink.href,
                    'data-ta': articleLink.getAttribute('data-ta'),
                    text: articleLink.textContent.trim()
                  });
                  
                  const result = await processPaperDownload(articleLink.href);
                  if (!result.success) {
                    console.error('❌ 处理文章失败:', result.message);
                  }
                  // 添加延迟，避免请求过于频繁
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                  console.log('❌ 未找到文章链接');
                }
              } else {
                console.log('❌ 未找到文章容器');
              }
            } catch (error) {
              console.error('❌ 处理单篇文章时出错:', error);
            }
          }
        } catch (error) {
          console.error('❌ 批量下载时出错:', error);
          alert('批量下载时出错: ' + error.message);
        }
      }
    });

    console.log('按钮事件监听器已添加');
  } catch (error) {
    console.error('创建下载按钮时出错:', error);
  }
}

// Observe checkbox changes
function observeCheckboxes() {
  console.log('Starting checkbox change observer');
  try {
    const observer = new MutationObserver((mutations) => {
      console.log('Detected DOM changes');
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          console.log('Child node changed');
          createDownloadButtons();
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    console.log('Checkbox observer started');
  } catch (error) {
    console.error('Error setting checkbox observer:', error);
  }
}

// Initialize
console.log('Starting plugin initialization');
try {
  createDownloadButtons();
  observeCheckboxes();
  console.log('Plugin initialization completed');
} catch (error) {
  console.error('Plugin initialization failed:', error);
}

// 添加消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  if (request.action === 'downloadSingle') {
    console.log('开始单个下载...');
    handleSingleDownload()
      .then(() => sendResponse({ message: '下载成功' }))
      .catch(error => sendResponse({ message: '下载失败: ' + error.message }));
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'downloadBulk') {
    console.log('开始批量下载...');
    handleBulkDownload()
      .then(() => sendResponse({ message: '批量下载成功' }))
      .catch(error => sendResponse({ message: '批量下载失败: ' + error.message }));
    return true; // 保持消息通道开放
  }
});

// 单个下载处理函数
async function handleSingleDownload() {
  try {
    // 1. 查找选中的复选框
    const selectedCheckboxes = document.querySelectorAll('input[type="checkbox"].mat-checkbox-input:checked');
    console.log('【步骤1】选中的复选框数量:', selectedCheckboxes.length);
    
    if (selectedCheckboxes.length === 0) {
      throw new Error('请先选择要下载的文章');
    }

    // 2. 获取第一个选中的复选框
    const selectedCheckbox = selectedCheckboxes[0];
    console.log('【步骤2】第一个选中的复选框:', selectedCheckbox);

    // 3. 查找文章容器和链接
    const articleContainer = selectedCheckbox.closest('.summary-record');
    if (!articleContainer) {
      console.log('❌ 未找到文章容器');
      throw new Error('未找到文章容器');
    }
    console.log('✅ 找到文章容器:', articleContainer);

    // 4. 查找文章链接
    const articleLink = articleContainer.querySelector('h3.summary-title a');
    if (!articleLink || !articleLink.href) {
      console.log('❌ 未找到文章链接');
      throw new Error('未找到文章链接');
    }
    console.log('✅ 找到文章链接:', articleLink.href);

    // 5. 处理下载
    const result = await processPaperDownload(articleLink.href);
    if (!result.success) {
      throw new Error(result.message);
    }

    return { success: true };
  } catch (error) {
    console.error('❌ 处理下载时出错:', error);
    throw error;
  }
}

// 批量下载处理函数
async function handleBulkDownload() {
  try {
    // 1. 查找所有选中的复选框
    const selectedCheckboxes = document.querySelectorAll('input.mat-checkbox-input.cdk-visually-hidden[type="checkbox"]:checked');
    console.log('【批量】选中的复选框数量:', selectedCheckboxes.length);
    
    if (selectedCheckboxes.length === 0) {
      throw new Error('请先选择要下载的文章');
    }

    // 2. 处理每个选中的文章
    for (const checkbox of selectedCheckboxes) {
      try {
        const appRecord = checkbox.closest('app-record');
        if (!appRecord) {
          console.log('❌ 未找到文章容器');
          continue;
        }

        const articleLink = appRecord.querySelector('app-summary-title h3 a[data-ta="summary-record-title-link"]');
        if (!articleLink || !articleLink.href) {
          console.log('❌ 未找到文章链接');
          continue;
        }

        const result = await processPaperDownload(articleLink.href);
        if (!result.success) {
          console.error('❌ 处理文章失败:', result.message);
        }

        // 添加延迟，避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('❌ 处理单篇文章时出错:', error);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('❌ 批量下载时出错:', error);
    throw error;
  }
} 