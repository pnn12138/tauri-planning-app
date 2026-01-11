type HomeProps = {
  hasVault: boolean;
  onSelectVault: () => void;
};

// Get current date in Chinese format
const getCurrentDate = () => {
  const now = new Date();
  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  
  return {
    month: months[now.getMonth()],
    day: now.getDate(),
    weekday: weekdays[now.getDay()]
  };
};

function Home({ hasVault, onSelectVault }: HomeProps) {
  const { month, day, weekday } = getCurrentDate();
  
  return (
    <section className="home-pane">
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-header-left">
            <div className="dashboard-logo">P</div>
            <div className="dashboard-date-info">
              <h1 className="dashboard-date">{month}{day}日 {weekday}</h1>
              <span className="dashboard-subtitle">今日规划与执行看板</span>
            </div>
          </div>
          
          <div className="dashboard-search">
            <span className="dashboard-search-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input type="text" className="dashboard-search-input" placeholder="搜索任务..." />
          </div>
          
          <div className="dashboard-header-right">
            <button className="dashboard-notification-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </button>
            <button className="dashboard-new-task-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              新建任务
            </button>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="dashboard-main">
          {/* Timeline Sidebar */}
          <aside className="timeline-sidebar">
            <div className="timeline-header">
              <div className="timeline-schedule-info">
                <span className="timeline-schedule-label">已排期:</span>
                <span className="timeline-schedule-hours">6.5h</span>
              </div>
              <div className="timeline-date-nav">
                <button className="timeline-nav-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <button className="timeline-nav-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
                <span className="timeline-today-badge">今日</span>
              </div>
            </div>
            
            <div className="timeline-content">
              <div className="timeline-container">
                {/* Now Indicator */}
                <div className="timeline-now-indicator">
                  <div className="timeline-now-time">11:30</div>
                  <div className="timeline-now-line">
                    <div className="timeline-now-dot"></div>
                  </div>
                </div>
                
                {/* Timeline Hours */}
                <div className="timeline-hour">
                  <div className="timeline-hour-time">08:00</div>
                  <div className="timeline-hour-line"></div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">09:00</div>
                  <div className="timeline-hour-line">
                    <div className="timeline-event orange">
                      <div className="timeline-event-title">客户会议 - 项目 A</div>
                      <div className="timeline-event-desc">Q3 交付物评审</div>
                    </div>
                  </div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">10:00</div>
                  <div className="timeline-hour-line">
                    <div className="timeline-event blue">
                      <div className="timeline-event-title">核心编码：组件开发</div>
                      <div className="timeline-event-desc">实现看板交互</div>
                      <div className="timeline-event-tag">高优先级</div>
                    </div>
                  </div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">11:00</div>
                  <div className="timeline-hour-line"></div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">12:00</div>
                  <div className="timeline-hour-line"></div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">13:00</div>
                  <div className="timeline-hour-line">
                    <div className="timeline-event emerald">
                      <span className="timeline-event-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"></path>
                        </svg>
                      </span>
                      <span className="timeline-event-restaurant">午休</span>
                    </div>
                  </div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">14:00</div>
                  <div className="timeline-hour-line">
                    <div className="timeline-event purple">
                      <div>
                        <div className="timeline-event-title">设计评审</div>
                        <div className="timeline-event-desc">产品团队</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">15:00</div>
                  <div className="timeline-hour-line"></div>
                </div>
                
                <div className="timeline-hour">
                  <div className="timeline-hour-time">16:00</div>
                  <div className="timeline-hour-line"></div>
                </div>
              </div>
            </div>
          </aside>
          
          {/* Kanban Section */}
          <section className="kanban-section">
            <div className="kanban-header">
              <div className="kanban-title-section">
                <h2 className="kanban-title">任务执行看板</h2>
                <nav className="kanban-nav">
                  <button className="kanban-nav-btn active">我的任务</button>
                  <button className="kanban-nav-btn">团队协作</button>
                  <button className="kanban-nav-btn">归档项目</button>
                </nav>
              </div>
              <div className="kanban-actions">
                <div className="kanban-view-toggle">
                  <button className="kanban-view-btn active">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                  </button>
                  <button className="kanban-view-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"></line>
                      <line x1="8" y1="12" x2="21" y2="12"></line>
                      <line x1="8" y1="18" x2="21" y2="18"></line>
                      <line x1="3" y1="6" x2="3.01" y2="6"></line>
                      <line x1="3" y1="12" x2="3.01" y2="12"></line>
                      <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <button className="kanban-filter-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="kanban-columns">
              {/* To Schedule */}
              <div className="kanban-column">
                <div className="kanban-column-header">
                  <div className="kanban-column-title-section">
                    <span className="kanban-column-title">待排期</span>
                    <span className="kanban-column-count">3</span>
                  </div>
                  <button className="kanban-column-add-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
                <div className="kanban-tasks">
                  <div className="task-card">
                    <div className="task-tag orange">行政</div>
                    <div className="task-title">发送月度报告给供应商</div>
                    <div className="task-meta">
                      <div className="task-meta-left">
                        <div className="task-meta-item">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          15m
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="task-card">
                    <div className="task-tag indigo">个人</div>
                    <div className="task-title">准备下周演示幻灯片</div>
                    <div className="task-meta">
                      <div className="task-meta-left">
                        <div className="task-meta-item">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          60m
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="task-card">
                    <div className="task-tag slate">杂项</div>
                    <div className="task-title">整理项目文件夹</div>
                    <div className="task-meta">
                      <div className="task-meta-left">
                        <div className="task-meta-item">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          30m
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* To Do */}
              <div className="kanban-column">
                <div className="kanban-column-header">
                  <div className="kanban-column-title-section">
                    <span className="kanban-column-title">待做</span>
                    <span className="kanban-column-count">1</span>
                  </div>
                  <button className="kanban-column-add-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
                <div className="kanban-tasks">
                  <div className="task-card blue-border">
                    <div className="task-card-header">
                      <div className="task-tag blue">设计系统</div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                        <circle cx="5" cy="12" r="1"></circle>
                      </svg>
                    </div>
                    <div className="task-title">更新移动端字体比例规范</div>
                    <div className="task-meta">
                      <div className="task-meta-left">
                        <div className="task-meta-item">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          45m
                        </div>
                        <div className="task-meta-item">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                          2
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* In Progress */}
              <div className="kanban-column active">
                <div className="kanban-column-header">
                  <div className="kanban-column-title-section">
                    <span className="kanban-column-title">进行中</span>
                    <span className="kanban-column-count">1</span>
                  </div>
                </div>
                <div className="kanban-tasks">
                  <div className="task-card active">
                    <div className="task-card-header">
                      <div className="task-tag purple">前端开发</div>
                      <div className="task-card-avatar">AM</div>
                    </div>
                    <div className="task-title">16:9 画布布局适配</div>
                    <div className="task-meta">
                      <div className="task-timer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span className="task-timer-text">01:45:12</span>
                      </div>
                      <span className="task-status">正在进行...</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Completed */}
              <div className="kanban-column">
                <div className="kanban-column-header">
                  <div className="kanban-column-title-section">
                    <span className="kanban-column-title">已完成</span>
                    <span className="kanban-column-count">12</span>
                  </div>
                </div>
                <div className="kanban-tasks">
                  <div className="task-card">
                    <div className="task-card-header">
                      <div className="task-tag slate">会议</div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <div className="task-title" style={{ textDecoration: 'line-through', color: '#94a3b8' }}>每日同步晨会</div>
                  </div>
                  
                  <div className="task-card">
                    <div className="task-card-header">
                      <div className="task-tag slate">产品</div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <div className="task-title" style={{ textDecoration: 'line-through', color: '#94a3b8' }}>整理新功能需求文档</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="kanban-footer">
              <p className="kanban-footer-text">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                点击卡片查看详情，拖拽卡片至左侧时间轴可快速排期
              </p>
            </div>
          </section>
        </main>
      </div>
    </section>
  );
}

export default Home;
