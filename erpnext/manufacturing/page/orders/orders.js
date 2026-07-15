// اتصال صفحه و ایجاد نمونه کلاس اصلی
frappe.pages['orders'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('داشبورد بهره‌وری کارمندان'),
        single_column: true
    });
    
    frappe.employee_productivity = new EmployeeProductivity(page);
};

/**
 * کلاس اصلی داشبورد بهره‌وری کارمندان
 * مسئول مدیریت کلی صفحه و تنظیمات اصلی
 */
class EmployeeProductivity {
    constructor(page) {
        this.page = page;
        if (!this.page || !this.page.main) {
            console.error('Page object is not properly initialized');
            return;
        }
        
        // متغیرهای اصلی
        this.current_tab = 'overview';
        this.data = {};
        this.realtime_timer = null;
        
        // ایجاد نمونه‌های کلاس‌های تب‌ها
        this.overviewTab = new OverviewTab(this);
        this.analyticsTab = new AnalyticsTab(this);
        this.realtimeTab = new RealtimeTab(this);
        this.workpathTab = new WorkpathTab(this);
        this.workstationStatusTab = new WorkstationStatusTab(this);
        
        // راه‌اندازی اولیه
        this.setup_filters();
        this.setup_layout();
        this.load_data();
    }
    
    /**
     * تنظیم فیلترهای صفحه
     */
    setup_filters() {
        // فیلتر از تاریخ
        this.page.add_field({
            fieldname: 'from_date',
            label: __('از تاریخ'),
            fieldtype: 'Date',
            default: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
            change: () => this.load_data()
        });
        
        // فیلتر تا تاریخ
        this.page.add_field({
            fieldname: 'to_date',
            label: __('تا تاریخ'),
            fieldtype: 'Date',
            default: frappe.datetime.get_today(),
            change: () => this.load_data()
        });
        
        // فیلتر کارمند
        this.page.add_field({
            fieldname: 'employee',
            label: __('کارمند'),
            fieldtype: 'Link',
            options: 'Employee',
            change: () => this.load_data()
        });
        
        // فیلتر ایستگاه کاری
        this.page.add_field({
            fieldname: 'workstation',
            label: __('ایستگاه کاری'),
            fieldtype: 'Link',
            options: 'Workstation',
            change: () => this.load_data()
        });
        
        // دکمه بروزرسانی
        this.page.add_menu_item(__('بروزرسانی'), () => {
            this.load_data();
        }, true);
        
        // دکمه صادرات گزارش
        this.page.add_menu_item(__('صادرات گزارش'), () => {
            this.export_report();
        });
    }
    
    /**
     * تنظیم ساختار کلی صفحه و تب‌ها
     */
    setup_layout() {
        this.page.main.html(`
            <div class="employee-productivity-dashboard">
                <!-- منوی تب‌های اصلی -->
                <div class="dashboard-tabs-wrapper">
                    <ul class="nav nav-tabs nav-tabs-custom" id="main-dashboard-tabs">
                        <li class="nav-item">
                            <a class="nav-link active" data-toggle="tab" data-target="#overview-tab" data-tab="overview">
                                <i class="fa fa-dashboard"></i> کلی
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" data-toggle="tab" data-target="#analytics-tab" data-tab="analytics">
                                <i class="fa fa-chart-bar"></i> تحلیل‌ها
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" data-toggle="tab" data-target="#gamification-tab" data-tab="gamification">
                                <i class="fa fa-trophy"></i> مسابقات
                            </a>
                        </li>
                        <li class="nav-item">
                           <a class="nav-link" data-toggle="tab" data-target="#realtime-tab" data-tab="realtime">
                                <i class="fa fa-satellite-dish"></i> نظارت لحظه‌ای
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" data-toggle="tab" data-target="#workpath-tab" data-tab="workpath">
                                <i class="fa fa-route"></i> مسیر کاری
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" data-toggle="tab" data-target="#workstation-status-tab" data-tab="workstation_status">
                                <i class="fa fa-industry"></i> وضعیت ایستگاه‌ها
                            </a>
                        </li>
                    </ul>
                </div>

                <!-- محتوای تب‌ها -->
                <div class="tab-content mt-3">
                    ${this.get_tab_contents()}
                </div>
            </div>
        `);
        
        // تنظیم رویداد تغییر تب
        this.setup_tab_events();
    }
    
    /**
     * محتوای HTML همه تب‌ها
     */
    get_tab_contents() {
        return `
            <!-- تب کلی -->
            <div class="tab-pane fade show active" id="overview-tab">
                ${this.overviewTab.get_html()}
            </div>

            <!-- تب تحلیل‌ها -->
            <div class="tab-pane fade" id="analytics-tab">
                ${this.analyticsTab.get_html()}
            </div>

            <!-- تب مسابقات -->
            <div class="tab-pane fade" id="gamification-tab">
                <div class="gamification-dashboard">
                    <div class="row">
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-header bg-primary text-white">
                                    <h6><i class="fa fa-trophy"></i> جدول امتیازات</h6>
                                </div>
                                <div class="card-body leaderboard-container"></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-header bg-success text-white">
                                    <h6><i class="fa fa-medal"></i> دستاوردها</h6>
                                </div>
                                <div class="card-body achievements-container"></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-header bg-warning text-white">
                                    <h6><i class="fa fa-target"></i> چالش‌های روزانه</h6>
                                </div>
                                <div class="card-body challenges-container"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- تب نظارت لحظه‌ای -->
            <div class="tab-pane fade" id="realtime-tab">
                ${this.realtimeTab.get_html()}
            </div>

            <!-- تب مسیر کاری -->
            <div class="tab-pane fade" id="workpath-tab">
                ${this.workpathTab.get_html()}
            </div>

            <!-- تب وضعیت ایستگاه‌ها -->
            <div class="tab-pane fade" id="workstation-status-tab">
                ${this.workstationStatusTab.get_html()}
            </div>
        `;
    }
    
    /**
     * تنظیم رویدادهای تب‌ها
     */
    setup_tab_events() {
        this.page.main.find('#main-dashboard-tabs a').on('shown.bs.tab', (e) => {
            const tab = $(e.target).data('tab');
            this.current_tab = tab;
            this.handle_tab_change(tab);
        });
    }
    
    /**
     * مدیریت تغییر تب
     */
    handle_tab_change(tab) {
        this.activate_tab(tab);
        
        switch(tab) {
            case 'overview':
                this.overviewTab.render();
                break;
            case 'analytics':
                this.analyticsTab.render();
                break;
            case 'gamification':
                this.render_gamification_panel();
                break;
            case 'realtime':
                this.realtimeTab.render();
                break;
            case 'workpath':
                this.workpathTab.render();
                break;
            case 'workstation_status':
                this.workstationStatusTab.render();
                break;
        }
    }

    /**
     * فعال کردن تب مورد نظر
     */
    activate_tab(tab_id) {
        // غیرفعال کردن همه تب‌ها
        this.page.main.find('#main-dashboard-tabs .nav-link').removeClass('active');
        this.page.main.find('.tab-pane').removeClass('active show');
        
        // فعال کردن تب انتخابی
        this.page.main.find(`[data-tab="${tab_id}"]`).addClass('active');
        this.page.main.find(`#${tab_id}-tab`).addClass('active show');
    }
    
    /**
     * دریافت فیلترهای انتخابی
     */
    get_filters() {
        return {
            from_date: this.page.fields_dict.from_date.get_value(),
            to_date: this.page.fields_dict.to_date.get_value(),
            employee: this.page.fields_dict.employee.get_value(),
            workstation: this.page.fields_dict.workstation.get_value()
        };
    }
    
    /**
     * بارگذاری داده‌های اصلی
     */
    load_data() {
        const filters = this.get_filters();
        
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_employee_productivity_data',
            args: { filters: filters },
            callback: (r) => {
                if (r.message) {
                    this.data = r.message;
                    
                    // رندر کردن تب فعلی
                    if (this.current_tab === 'overview') {
                        this.overviewTab.render();
                    }
                }
            }
        });
    }
    
    /**
     * صادرات گزارش
     */
    export_report() {
        const filters = this.get_filters();
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.export_productivity_report',
            args: { filters: filters },
            callback: (r) => {
                if (r.message) {
                    window.open(r.message.url);
                }
            }
        });
    }
    
    /**
     * رندر پنل مسابقات (استفاده از کلاس موجود)
     */
    render_gamification_panel() {
        const panel = new GamificationPanel(this.page, this.data);
        panel.render_gamification_panel();
    }
    
    /**
     * مشاهده جزئیات کارمند
     */
    view_employee_details(employee) {
        frappe.set_route('Form', 'Employee', employee);
    }
    
    /**
     * تولید گزارش کارمند
     */
    generate_employee_report(employee) {
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.generate_employee_productivity_report',
            args: {
                employee: employee,
                filters: this.get_filters()
            },
            callback: (r) => {
                if (r.message) {
                    frappe.msgprint({
                        title: 'گزارش تولید شد',
                        message: 'گزارش بهره‌وری کارمند با موفقیت تولید شد.',
                        indicator: 'green'
                    });
                }
            }
        });
    }
    
    /**
     * پاکسازی منابع هنگام خروج
     */
    cleanup() {
        if (this.realtime_timer) {
            clearInterval(this.realtime_timer);
        }
        if (this.realtimeTab.realtime_timer) {
            clearInterval(this.realtimeTab.realtime_timer);
        }
    }
}

/**
 * کلاس تب کلی (Overview)
 * نمایش خلاصه‌ای از عملکرد کلی
 */
class OverviewTab {
    constructor(parent) {
        this.parent = parent;
    }
    
    /**
     * دریافت HTML تب کلی
     */
    get_html() {
        return `
            <div class="overview-dashboard">
                <div class="row mb-4">
                    <div class="col-md-12">
                        <div class="summary-cards-container"></div>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-users text-primary"></i> برترین عملکردها</h5>
                            </div>
                            <div class="card-body top-performers-chart"></div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-chart-line text-success"></i> روند بهره‌وری</h5>
                            </div>
                            <div class="card-body efficiency-trend-chart"></div>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-3">
                    <div class="col-md-12">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-table text-info"></i> جدول تفصیلی بهره‌وری</h5>
                            </div>
                            <div class="card-body productivity-table-container"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * رندر کردن محتوای تب
     */
    render() {
        this.render_summary_cards();
        this.render_top_performers_chart();
        this.render_efficiency_trend_chart();
        this.render_productivity_table();
        console.log('WorkstationStatusTab render called');

    }
    
    /**
     * نمایش کارت‌های خلاصه
     */

    render_summary_cards() {
    const summary = this.parent.data.summary || {};
    const productivity_scores = this.parent.data.productivity_scores || {};
    const container = this.parent.page.main.find('.summary-cards-container');
    
    // محاسبه کل کارمندان از productivity_scores
    const total_employees = Object.keys(productivity_scores).length || summary.total_employees || 0;
    
    container.html(`
        <div class="row">
            <div class="col-md-3">
                <div class="info-card bg-primary">
                    <div class="info-card-body">
                        <div class="info-icon">
                            <i class="fa fa-users"></i>
                        </div>
                        <div class="info-content">
                            <h3>${total_employees}</h3>
                            <p>کل کارمندان</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="info-card bg-success">
                    <div class="info-card-body">
                        <div class="info-icon">
                            <i class="fa fa-chart-line"></i>
                        </div>
                        <div class="info-content">
                            <h3>${flt(summary.average_efficiency, 1)}%</h3>
                            <p>میانگین بهره‌وری</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="info-card bg-info">
                    <div class="info-card-body">
                        <div class="info-icon">
                            <i class="fa fa-star"></i>
                        </div>
                        <div class="info-content">
                            <h3>${summary.top_performer ? summary.top_performer.employee : '---'}</h3>
                            <p>برترین عملکرد</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="info-card bg-warning">
                    <div class="info-card-body">
                        <div class="info-icon">
                            <i class="fa fa-tasks"></i>
                        </div>
                        <div class="info-content">
                            <h3>${this.parent.data.job_cards ? this.parent.data.job_cards.length : 0}</h3>
                            <p>کل کارت‌های شغلی</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
}
    
    /**
     * نمودار برترین عملکردها
     */
    render_top_performers_chart() {
        const container = this.parent.page.main.find('.top-performers-chart');
        const rankings = this.parent.data.summary?.rankings || [];
        
        // در صورت عدم وجود رنکینگ، از productivity_scores استفاده کن
        if (rankings.length === 0 && this.parent.data.productivity_scores) {
            const scores = Object.values(this.parent.data.productivity_scores);
            rankings.push(...scores.sort((a, b) => (b.final_score || 0) - (a.final_score || 0)));
        }
        
        if (rankings.length === 0) {
            container.html('<p class="text-muted text-center">داده‌ای در دسترس نیست</p>');
            return;
        }
        
        const labels = rankings.slice(0, 10).map(emp => emp.employee);
        const scores = rankings.slice(0, 10).map(emp => emp.final_score || 0);
        
        const chartContainer = $('<div></div>');
        container.empty().append(chartContainer);
        
        new frappe.Chart(chartContainer[0], {
            title: '10 عملکرد برتر',
            data: {
                labels: labels,
                datasets: [{
                    name: 'امتیاز نهایی',
                    values: scores
                }]
            },
            type: 'bar',
            height: 300,
            colors: ['#28a745']
        });
    }
    
    /**
     * نمودار روند بهره‌وری
     */
    render_efficiency_trend_chart() {
        const container = this.parent.page.main.find('.efficiency-trend-chart');
        const productivity_scores = Object.values(this.parent.data.productivity_scores || {});
        
        if (productivity_scores.length === 0) {
            container.html('<p class="text-muted text-center">داده‌ای در دسترس نیست</p>');
            return;
        }
        
        const labels = productivity_scores.map(emp => emp.employee);
        const efficiency = productivity_scores.map(emp => emp.efficiency_score || 0);
        
        const chartContainer = $('<div></div>');
        container.empty().append(chartContainer);
        
        new frappe.Chart(chartContainer[0], {
            title: 'مقایسه بهره‌وری',
            data: {
                labels: labels,
                datasets: [{
                    name: 'درصد بهره‌وری',
                    values: efficiency
                }]
            },
            type: 'line',
            height: 300,
            colors: ['#007bff']
        });
    }
    
    /**
     * جدول تفصیلی بهره‌وری
     */
    render_productivity_table() {
        const container = this.parent.page.main.find('.productivity-table-container');
        const productivity_scores = Object.values(this.parent.data.productivity_scores || {});
        
        if (productivity_scores.length === 0) {
            container.html('<p class="text-muted text-center">هیچ داده‌ای برای نمایش وجود ندارد</p>');
            return;
        }
        
        let html = `
            <div class="table-responsive">
                <table class="table table-striped table-hover">
                    <thead class="thead-dark">
                        <tr>
                            <th>رتبه</th>
                            <th>کارمند</th>
                            <th>امتیاز نهایی</th>
                            <th>درصد بهره‌وری</th>
                            <th>درصد کیفیت</th>
                            <th>کارت‌های شغلی</th>
                            <th>مجموع تولید</th>
                            <th>نشان‌ها</th>
                            <th>عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // مرتب‌سازی بر اساس امتیاز نهایی
        const sortedEmployees = productivity_scores.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
        
        sortedEmployees.forEach((emp, index) => {
            const badges = (emp.badges || []).map(badge => 
                `<span class="badge badge-${badge.color || 'secondary'}" title="${badge.name}">
                    ${badge.icon} ${badge.name}
                </span>`
            ).join(' ');
            
            const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1;
            
            html += `
                <tr>
                    <td>
                        <span class="rank-display">${rankIcon}</span>
                    </td>
                    <td>
                        <div class="employee-cell">
                            <strong>${emp.employee}</strong>
                            <small class="text-muted d-block">ID: ${emp.employee_id || 'نامشخص'}</small>
                        </div>
                    </td>
                    <td>
                        <span class="badge badge-primary badge-lg">${flt(emp.final_score || 0, 2)}</span>
                    </td>
                    <td>
                        <div class="progress-cell">
                            <div class="progress">
                                <div class="progress-bar bg-success" style="width: ${emp.efficiency_score || 0}%"></div>
                            </div>
                            <small>${flt(emp.efficiency_score || 0, 1)}%</small>
                        </div>
                    </td>
                    <td>
                        <div class="progress-cell">
                            <div class="progress">
                                <div class="progress-bar bg-info" style="width: ${emp.quality_score || 0}%"></div>
                            </div>
                            <small>${flt(emp.quality_score || 0, 1)}%</small>
                        </div>
                    </td>
                    <td>
                        <span class="badge badge-outline-secondary">${emp.job_cards_count || 0}</span>
                    </td>
                    <td>
                        <strong>${flt(emp.total_output || 0, 0)}</strong>
                    </td>
                    <td>
                        <div class="badges-cell">
                            ${badges || '<span class="text-muted">-</span>'}
                        </div>
                    </td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary btn-sm" onclick="frappe.employee_productivity.view_employee_details('${emp.employee}')">
                                <i class="fa fa-eye"></i>
                            </button>
                            <button class="btn btn-outline-success btn-sm" onclick="frappe.employee_productivity.generate_employee_report('${emp.employee}')">
                                <i class="fa fa-file-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.html(html);
    }
}

/**
 * کلاس تب تحلیل‌ها (Analytics)
 * نمایش نمودارهای تحلیلی پیشرفته
 */
class AnalyticsTab {
    constructor(parent) {
        this.parent = parent;
        this.analytics_data = null;
    }
    
    /**
     * دریافت HTML تب تحلیل‌ها
     */
    get_html() {
        return `
            <div class="analytics-dashboard">
                <div class="row">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-pie-chart text-warning"></i> توزیع بهره‌وری</h5>
                            </div>
                            <div class="card-body productivity-distribution-chart"></div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-clock text-danger"></i> تحلیل زمان‌بندی</h5>
                            </div>
                            <div class="card-body time-analysis-chart"></div>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-3">
                    <div class="col-md-12">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-industry text-primary"></i> عملکرد ایستگاه‌های کاری</h5>
                            </div>
                            <div class="card-body workstation-performance-chart"></div>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-3">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-calendar text-success"></i> تحلیل هفتگی</h5>
                            </div>
                            <div class="card-body weekly-analysis-chart"></div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-shield-alt text-info"></i> شاخص کیفیت</h5>
                            </div>
                            <div class="card-body quality-metrics-chart"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * رندر کردن محتوای تب
     */
    render() {
        this.load_analytics_data();
    }
    
    /**
     * بارگذاری داده‌های تحلیلی
     */
    load_analytics_data() {
        const filters = this.parent.get_filters();
        
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_enhanced_productivity_data',
            args: { filters: filters },
            callback: (r) => {
                if (r.message) {
                    this.analytics_data = r.message;
                    this.render_analytics_charts();
                } else {
                    // اگر داده نیست، نمودارهای نمونه نمایش بده
                    this.render_sample_analytics_charts();
                }
            }
        });
    }
    
    /**
     * رندر همه نمودارهای تحلیلی
     */
    render_analytics_charts() {
        this.render_productivity_distribution();
        this.render_time_analysis();
        this.render_workstation_performance();
        this.render_weekly_analysis();
        this.render_quality_metrics();
    }
    
    /**
     * نمودار توزیع بهره‌وری
     */

    render_productivity_distribution() {
    const container = this.parent.page.main.find('.productivity-distribution-chart');
    container.empty();

    frappe.call({
        method: "erpnext.manufacturing.page.orders.orders.get_productivity_scores",
        args: { filters: this.parent.get_filters() },
        callback: (r) => {
            const data = r.message || [];

            if (!data.length) {
                container.html('<p class="text-muted text-center">داده‌ای در دسترس نیست</p>');
                return;
            }

            const levels = {
                'عالی (90%+)': 0,
                'خوب (70-90%)': 0,
                'متوسط (50-70%)': 0,
                'ضعیف (<50%)': 0
            };

            data.forEach(emp => {
                const eff = emp.efficiency_score || 0;
                if (eff >= 90) levels['عالی (90%+)']++;
                else if (eff >= 70) levels['خوب (70-90%)']++;
                else if (eff >= 50) levels['متوسط (50-70%)']++;
                else levels['ضعیف (<50%)']++;
            });

            const chartContainer = $('<div></div>');
            container.append(chartContainer);

            new frappe.Chart(chartContainer[0], {
                title: 'توزیع سطح عملکرد',
                data: {
                    labels: Object.keys(levels),
                    datasets: [{
                        name: 'تعداد کارمندان',
                        values: Object.values(levels)
                    }]
                },
                type: 'pie',
                height: 300,
                colors: ['#28a745', '#ffc107', '#fd7e14', '#dc3545']
            });
        },
        error: (err) => {
            console.error("Error loading productivity distribution:", err);
            container.html('<p class="text-danger text-center">خطا در بارگذاری داده‌ها</p>');
        }
    });
}


    /**
     * نمودار تحلیل زمان‌بندی
     */
    render_time_analysis() {
        const container = this.parent.page.main.find('.time-analysis-chart');
        container.empty();

        frappe.call({
            method: "erpnext.manufacturing.page.orders.orders.get_time_analysis_data", // مسیر متد Python
            args: { filters: this.parent.get_filters() },
            callback: (r) => {
                const data = r.message;
                if (!data || !data.values || data.values.every(v => v === 0)) {
                    container.html('<p class="text-muted text-center">داده‌ای در دسترس نیست</p>');
                    return;
                }

                const chartContainer = $('<div></div>');
                container.append(chartContainer);

                new frappe.Chart(chartContainer[0], {
                    title: 'بهره‌وری در ساعات مختلف روز',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            name: 'میانگین بهره‌وری',
                            values: data.values
                        }]
                    },
                    type: 'line',
                    height: 300,
                    colors: ['#dc3545']
                });
            },
            error: (err) => {
                console.error("Error loading time analysis:", err);
                container.html('<p class="text-danger text-center">خطا در بارگذاری داده‌ها</p>');
            }
        });
    }

    
    /**
     * نمودار عملکرد ایستگاه‌های کاری
     */
/**
 * نمودار عملکرد ایستگاه‌های کاری
 */
/**
 * نمودار عملکرد ایستگاه‌های کاری
 * داده واقعی از backend فراخوانی می‌شود
 */
    render_workstation_performance() {
        const container = this.parent.page.main.find('.workstation-performance-chart');

        // ابتدا container خالی شود
        container.empty();

        // فراخوانی API بک‌اند برای محاسبه بهره‌وری ایستگاه‌ها
        frappe.call({
            method: "erpnext.manufacturing.page.orders.orders.get_workstation_efficiency", // مسیر متد Python
            args: { filters: this.parent.get_filters() },
            callback: (r) => {
                const data = r.message || [];

                if (!data.length) {
                    container.html('<p class="text-muted text-center">داده‌ای در دسترس نیست</p>');
                    return;
                }

                // استخراج labels و values
                const labels = data.map(d => d.workstation);
                const values = data.map(d => d.efficiency || 0);

                // اگر همه مقادیر صفر باشند، نمایش پیام بده
                if (values.every(v => v === 0)) {
                    container.html('<p class="text-muted text-center">داده‌ای در دسترس نیست</p>');
                    return;
                }

                // ایجاد container div برای chart
                const chartContainer = $('<div></div>');
                container.append(chartContainer);

                // رسم نمودار bar
                new frappe.Chart(chartContainer[0], {
                    title: 'عملکرد ایستگاه‌های کاری',
                    data: {
                        labels: labels,
                        datasets: [{
                            name: 'میانگین بهره‌وری',
                            values: values
                        }]
                    },
                    type: 'bar',
                    height: 300,
                    colors: ['#17a2b8']
                });
            },
            error: (err) => {
                console.error("Error loading workstation efficiency:", err);
                container.html('<p class="text-danger text-center">خطا در بارگذاری داده‌ها</p>');
            }
        });
    }

    
    /**
     * نمودار تحلیل هفتگی
     */

    render_weekly_analysis() {
        const container = this.parent.page.main.find('.weekly-analysis-chart');
        container.empty();

        frappe.call({
            method: "erpnext.manufacturing.page.orders.orders.get_weekly_analysis_data",
            args: { filters: this.parent.get_filters() },
            callback: (r) => {
                const data = r.message;
                if (!data || (!data.efficiency.length && !data.avg_hours.length)) {
                    container.html('<p class="text-muted text-center">داده‌ای در دسترس نیست</p>');
                    return;
                }

                const chartContainer = $('<div></div>');
                container.append(chartContainer);

                new frappe.Chart(chartContainer[0], {
                    title: 'تحلیل عملکرد هفتگی',
                    data: {
                        labels: data.labels,
                        datasets: [
                            {
                                name: 'میانگین بهره‌وری (%)',
                                values: data.efficiency
                            },
                            {
                                name: 'میانگین ساعت کارکرد',
                                values: data.avg_hours
                            }
                        ]
                    },
                    type: 'line',
                    height: 300,
                    colors: ['#28a745', '#17a2b8'] // بهره‌وری سبز، ساعت کارکرد آبی
                });
            },
            error: (err) => {
                console.error("Error loading weekly analysis:", err);
                container.html('<p class="text-danger text-center">خطا در بارگذاری داده‌ها</p>');
            }
        });
    }

    
    /**
     * رندر نمودارهای نمونه در صورت عدم وجود داده
     */
    
    render_sample_analytics_charts() {
        frappe.require("/assets/frappe/js/frappe-charts.min.iife.js", () => {
            this.render_productivity_distribution();
            this.render_time_analysis();
            this.render_workstation_performance();
            this.render_weekly_analysis();
            this.render_quality_metrics();
        });
    }
}

/**
 * کلاس تب نظارت لحظه‌ای (Realtime)
 * نمایش وضعیت کارمندان در لحظه
 */

class RealtimeTab {
    constructor(parent) {
        this.parent = parent;
        this.realtime_data = null;
        this.realtime_timer = null;
        this.selected_date = frappe.datetime.get_today();
        this.expanded_employees = new Set();
    }
    
    /**
     * دریافت HTML تب نظارت لحظه‌ای
     */
    get_html() {
        return `
            <div class="realtime-dashboard">
                <!-- Date Filter Section -->
                <div class="row mb-3">
                    <div class="col-md-12">
                        <div class="realtime-header">
                            <div class="header-left">
                                <h4><i class="fa fa-satellite-dish text-success"></i> نظارت لحظه‌ای کارمندان</h4>
                                <div class="realtime-status">
                                    <span class="live-indicator">
                                        <span class="pulse-dot"></span>
                                        زنده
                                    </span>
                                    <span class="last-update">آخرین بروزرسانی: <span id="last-update-time">--</span></span>
                                </div>
                            </div>
                            <div class="header-right">
                                <div class="date-filter-group">
                                    <label for="realtime-date-filter">تاریخ:</label>
                                    <input type="date" id="realtime-date-filter" class="form-control" 
                                           value="${this.selected_date}" style="width: auto; display: inline-block;">
                                    <button class="btn btn-primary btn-sm" id="load-date-btn">
                                        <i class="fa fa-calendar"></i> بارگذاری
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-12">
                        <div class="status-summary-cards"></div>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-8">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-users text-primary"></i> وضعیت کارمندان</h5>
                                <div class="card-tools">
                                    <button class="btn btn-sm btn-outline-primary" id="refresh-realtime-btn">
                                        <i class="fa fa-sync"></i> بروزرسانی
                                    </button>
                                    <button class="btn btn-sm btn-outline-info" id="expand-all-btn">
                                        <i class="fa fa-expand"></i> باز کردن همه
                                    </button>
                                    <button class="btn btn-sm btn-outline-info" id="collapse-all-btn">
                                        <i class="fa fa-compress"></i> بستن همه
                                    </button>
                                </div>
                            </div>
                            <div class="card-body employee-status-grid"></div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fa fa-industry text-info"></i> ایستگاه‌های کاری</h5>
                            </div>
                            <div class="card-body workstation-status-list"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * رندر کردن محتوای تب
     */
    render() {
        this.setup_date_filter();
        this.setup_control_buttons();
        this.setup_status_filters();

        this.load_realtime_data();
        this.init_realtime_updates();
    }
    
    /**
     * تنظیم فیلتر تاریخ
     */
    setup_date_filter() {
        const dateInput = this.parent.page.main.find('#realtime-date-filter');
        const loadBtn = this.parent.page.main.find('#load-date-btn');
        
        loadBtn.off('click').on('click', () => {
            this.selected_date = dateInput.val();
            this.load_realtime_data();
        });
        
        // Enter key support
        dateInput.off('keypress').on('keypress', (e) => {
            if (e.which === 13) {
                loadBtn.click();
            }
        });
    }
    
    /**
     * تنظیم دکمه‌های کنترل
     */
    setup_control_buttons() {
        // دکمه بروزرسانی
        this.parent.page.main.find('#refresh-realtime-btn').off('click').on('click', () => {
            this.load_realtime_data();
        });
        
        // باز کردن همه
        this.parent.page.main.find('#expand-all-btn').off('click').on('click', () => {
            this.expand_all_employees();
        });
        
        // بستن همه  
        this.parent.page.main.find('#collapse-all-btn').off('click').on('click', () => {
            this.collapse_all_employees();
        });
    }
    
    /**
     * بارگذاری داده‌های لحظه‌ای
     */
    load_realtime_data() {
        const filters = {
            date: this.selected_date,
            ...this.parent.get_filters()
        };
        
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_manufacturing_employees_status',
            args: { filters: filters },
            callback: (r) => {
                if (r.message) {
                    this.realtime_data = r.message;
                    this.render_realtime_dashboard();
                    this.update_last_update_time();
                }
            }
        });
    }
    
    
        /**
     * تنظیم فیلترهای وضعیت
     */
    setup_status_filters() {
        const statusCards = this.parent.page.main.find('.status-card');
        
        statusCards.off('click').on('click', (e) => {
            const clickedCard = $(e.currentTarget);
            const statusType = clickedCard.hasClass('working') ? 'working' :
                            clickedCard.hasClass('idle') ? 'idle' :
                            clickedCard.hasClass('break') ? 'on_break' : 'offline';
            
            this.filter_employees_by_status(statusType);
            
            // Visual feedback
            statusCards.removeClass('active');
            clickedCard.addClass('active');
        });
    }

    /**
     * فیلتر کارمندان بر اساس وضعیت
     */
    filter_employees_by_status(statusType) {
        const employeeCards = this.parent.page.main.find('.employee-card-collapsible');
        
        if (!statusType) {
            employeeCards.show();
        } else {
            employeeCards.hide();
            employeeCards.filter(`[data-status="${statusType}"]`).show();
        }
    }
    /**
     * بارگذاری جزئیات کارمند
     */
    load_employee_details(employee_id) {
        return new Promise((resolve) => {
            frappe.call({
                method: 'erpnext.manufacturing.page.orders.orders.get_employee_daily_details',
                args: { 
                    employee_id: employee_id,
                    date: this.selected_date
                },
                callback: (r) => {
                    resolve(r.message || {});
                }
            });
        });
    }
    
    /**
     * رندر داشبورد لحظه‌ای
     */
    render_realtime_dashboard() {
        this.setup_status_filters();
        this.render_status_summary();
        this.render_employee_status_grid();
        this.render_workstation_status();
        this.setup_status_card_filters();
    }
    
setup_status_card_filters() {
    const statusCards = this.parent.page.main.find('.status-card');
    
    statusCards.off('click').on('click', (e) => {
        const clickedCard = $(e.currentTarget);
        const statusType = clickedCard.attr('data-status');
        
        this.filter_employees_by_status(statusType);
        
        // Visual feedback
        statusCards.removeClass('active');
        clickedCard.addClass('active');
    });
}

    /**
     * کارت‌های خلاصه وضعیت
     */
render_status_summary() {
   const container = this.parent.page.main.find('.status-summary-cards');
   const status = this.realtime_data?.status_summary || {};
   
   const isToday = this.selected_date === frappe.datetime.get_today();
   const dateLabel = isToday ? 'امروز' : frappe.datetime.str_to_user(this.selected_date);
   
   container.html(`
       <div class="date-summary-header">
           <h6><i class="fa fa-calendar"></i> خلاصه وضعیت برای ${dateLabel}</h6>
       </div>
       <div class="row">
           <div class="col-md-2">
               <div class="status-card all-status" data-status="">
                   <div class="status-icon">
                       <i class="fa fa-users"></i>
                   </div>
                   <div class="status-content">
                       <h3>${(status.working || 0) + (status.idle || 0) + (status.on_break || 0) + (status.offline || 0)}</h3>
                       <p>همه</p>
                   </div>
               </div>
           </div>
           <div class="col-md-2">
               <div class="status-card working" data-status="working">
                   <div class="status-icon">
                       <i class="fa fa-user-cog"></i>
                   </div>
                   <div class="status-content">
                       <h3>${status.working || 0}</h3>
                       <p>در حال کار</p>
                   </div>
               </div>
           </div>
           <div class="col-md-2">
               <div class="status-card idle" data-status="idle">
                   <div class="status-icon">
                       <i class="fa fa-user-clock"></i>
                   </div>
                   <div class="status-content">
                       <h3>${status.idle || 0}</h3>
                       <p>بیکار</p>
                   </div>
               </div>
           </div>
           <div class="col-md-2">
               <div class="status-card break" data-status="on_break">
                   <div class="status-icon">
                       <i class="fa fa-coffee"></i>
                   </div>
                   <div class="status-content">
                       <h3>${status.on_break || 0}</h3>
                       <p>استراحت</p>
                   </div>
               </div>
           </div>
           <div class="col-md-2">
               <div class="status-card offline" data-status="offline">
                   <div class="status-icon">
                       <i class="fa fa-user-times"></i>
                   </div>
                   <div class="status-content">
                       <h3>${status.offline || 0}</h3>
                       <p>غایب</p>
                   </div>
               </div>
           </div>
       </div>
   `);
}
    
    /**
     * شبکه وضعیت کارمندان با قابلیت باز شدن
     */


    render_employee_status_grid() {
    const container = this.parent.page.main.find('.employee-status-grid');
    const employees = this.realtime_data?.employees || [];
    
    if (employees.length === 0) {
        container.html('<p class="text-muted text-center">هیچ کارمندی یافت نشد</p>');
        return;
    }
    
    let html = '<div class="employee-grid-collapsible">';
    
    employees.forEach(emp => {
        const statusClass = this.getStatusClass(emp.status || 'offline');
        const statusIcon = this.getStatusIcon(emp.status);
        const statusText = this.getStatusText(emp.status);
        const isExpanded = this.expanded_employees.has(emp.employee_id);
        
        html += `
            <div class="employee-card-collapsible ${statusClass}" data-employee-id="${emp.employee_id}" data-status="${emp.status || 'offline'}">
                <div class="employee-card-header" data-employee-id="${emp.employee_id}">
                    <div class="employee-basic-info">
                        <div class="employee-avatar">
                            <img src="${emp.image || '/assets/frappe/images/default-avatar.png'}" alt="${emp.employee_name}">
                            <div class="status-indicator ${statusClass}">
                                <i class="${statusIcon}"></i>
                            </div>
                        </div>
                        <div class="employee-info">
                            <h6 class="employee-name">${emp.employee_name || emp.employee_id}</h6>
                            <p class="employee-id">${emp.employee_id}</p>
                            <div class="employee-status">
                                <span class="status-badge ${statusClass}">
                                    <i class="${statusIcon}"></i>
                                    ${statusText}
                                </span>
                            </div>
                            ${emp.department ? `<small class="text-muted">${emp.department}</small>` : ''}
                        </div>
                    </div>
                    <div class="expand-toggle">
                        <i class="fa fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                    </div>
                </div>
                
                <div class="employee-details ${isExpanded ? 'expanded' : ''}" id="details-${emp.employee_id}">
                    <div class="details-content">
                        <div class="loading-placeholder">
                            <i class="fa fa-spinner fa-spin"></i> در حال بارگذاری جزئیات...
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.html(html);

    // 🎯 این قسمت مهمه: هندلر کلیک
    container.find(".employee-card-header").off("click").on("click", (e) => {
        const empId = $(e.currentTarget).data("employee-id");
        this.toggle_employee_details(empId);
    });

    // بارگذاری جزئیات کارمندان باز شده
    this.expanded_employees.forEach(emp_id => {
        this.load_and_render_employee_details(emp_id);
    });
}

    /**
     * تغییر وضعیت باز/بسته جزئیات کارمند
     */
toggle_employee_details(employee_id) {
    const detailsDiv = this.parent.page.main.find(`#details-${employee_id}`);
    const cardElement = detailsDiv.closest('.employee-card'); // یا هر کلاسی که کارتت داره
    const toggleIcon = cardElement.find('.expand-toggle i');

    if (this.expanded_employees.has(employee_id)) {
        // بستن
        this.expanded_employees.delete(employee_id);
        detailsDiv.removeClass('expanded');
        toggleIcon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
    } else {
        // باز کردن
        this.expanded_employees.add(employee_id);
        detailsDiv.addClass('expanded');
        toggleIcon.removeClass('fa-chevron-down').addClass('fa-chevron-up');

        // بارگذاری جزئیات
        this.load_and_render_employee_details(employee_id);
    }
}

    
    /**
     * بارگذاری و رندر جزئیات کارمند
     */
    async load_and_render_employee_details(employee_id) {
        const contentDiv = this.parent.page.main.find(`#details-${employee_id} .details-content`);
        
        try {
            const details = await this.load_employee_details(employee_id);
            
            if (!details || details.status === 'absent') {
                contentDiv.html(`
                    <div class="employee-absent-info">
                        <div class="absent-message">
                            <i class="fa fa-user-times text-muted"></i>
                            <p>این کارمند در تاریخ ${frappe.datetime.str_to_user(this.selected_date)} غایب بوده است.</p>
                        </div>
                    </div>
                `);
                return;
            }
            
            let detailsHtml = `
                <div class="employee-work-summary">
                    <div class="summary-cards">
                        <div class="summary-card">
                            <div class="card-icon"><i class="fa fa-clock text-primary"></i></div>
                            <div class="card-content">
                                <h5>${details.total_hours || 0}</h5>
                                <p>ساعت کار</p>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="card-icon"><i class="fa fa-tasks text-success"></i></div>
                            <div class="card-content">
                                <h5>${details.jobs_count || 0}</h5>
                                <p>کار انجام شده</p>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="card-icon"><i class="fa fa-sign-in-alt text-info"></i></div>
                            <div class="card-content">
                                <h5>${details.first_in ? frappe.datetime.str_to_user(details.first_in).split(' ')[1] : '--'}</h5>
                                <p>ورود</p>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="card-icon"><i class="fa fa-sign-out-alt text-warning"></i></div>
                            <div class="card-content">
                                <h5>${details.last_out ? frappe.datetime.str_to_user(details.last_out).split(' ')[1] : '--'}</h5>
                                <p>خروج</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            if (details.jobs && details.jobs.length > 0) {
                detailsHtml += `
                    <div class="employee-jobs-list">
                        <h6><i class="fa fa-list text-primary"></i> جزئیات کارهای انجام شده</h6>
                        <div class="jobs-timeline" style="max-height: 400px; overflow-y: auto;">

                `;
                
                details.jobs.forEach((job, index) => {
                    const startTime = job.from_time ? frappe.datetime.str_to_user(job.from_time).split(' ')[1] : '--';
                    const endTime = job.to_time ? frappe.datetime.str_to_user(job.to_time).split(' ')[1] : 'در حال انجام';
                    const duration = job.time_in_mins ? Math.round(job.time_in_mins / 60 * 100) / 100 : 0;
                    
                    detailsHtml += `
                        <div class="job-timeline-item">
                            <div class="timeline-marker ${job.to_time ? 'completed' : 'ongoing'}">
                                <i class="fa fa-${job.to_time ? 'check' : 'play'}"></i>
                            </div>
                            <div class="timeline-content">
                                <div class="job-header">
                                    <h6 class="job-title">${job.job_card}</h6>
                                    <span class="job-status ${job.to_time ? 'completed' : 'ongoing'}">
                                        ${job.to_time ? 'تکمیل شده' : 'در حال انجام'}
                                    </span>
                                </div>
                                <div class="job-details">
                                    <div class="detail-row">
                                        <span class="label"><i class="fa fa-industry"></i> ایستگاه:</span>
                                        <span class="value">${job.workstation || '--'}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="label"><i class="fa fa-cog"></i> عملیات:</span>
                                        <span class="value">${job.operation || '--'}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="label"><i class="fa fa-file-alt"></i> سفارش کار:</span>
                                        <span class="value">${job.work_order || '--'}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="label"><i class="fa fa-clock"></i> زمان:</span>
                                        <span class="value">${startTime} - ${endTime} (${duration} ساعت)</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="label"><i class="fa fa-check-square"></i> تعداد تکمیل:</span>
                                        <span class="value">${job.completed_qty || 0}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                detailsHtml += `
                        </div>
                    </div>
                `;
            }
            
            contentDiv.html(detailsHtml);
            
        } catch (error) {
            console.error('Error loading employee details:', error);
            contentDiv.html(`
                <div class="error-message">
                    <i class="fa fa-exclamation-triangle text-danger"></i>
                    <p>خطا در بارگذاری جزئیات کارمند</p>
                </div>
            `);
        }
    }
    
    /**
     * باز کردن همه کارمندان
     */
    expand_all_employees() {
        const employees = this.realtime_data?.employees || [];
        employees.forEach(emp => {
            if (!this.expanded_employees.has(emp.employee_id)) {
                this.toggle_employee_details(emp.employee_id);
            }
        });
    }
    
    /**
     * بستن همه کارمندان
     */
    collapse_all_employees() {
        const expandedList = Array.from(this.expanded_employees);
        expandedList.forEach(emp_id => {
            this.toggle_employee_details(emp_id);
        });
    }
    
    /**
     * لیست وضعیت ایستگاه‌های کاری بهبود یافته
     */
    render_workstation_status() {
        const container = this.parent.page.main.find('.workstation-status-list');
        const workstations = this.realtime_data?.workstations || [];
        
        if (workstations.length === 0) {
            container.html('<p class="text-muted text-center">هیچ ایستگاه کاری یافت نشد</p>');
            return;
        }
        
        let html = '<div class="workstation-list-enhanced">';
        
        workstations.forEach(ws => {
            const utilizationPercent = ws.utilization || 0;
            const utilizationClass = utilizationPercent > 80 ? 'high' : utilizationPercent > 50 ? 'medium' : 'low';
            const statusClass = this.getWorkstationStatusClass(ws.status);
            const statusIcon = this.getWorkstationStatusIcon(ws.status);
            const statusText = this.getWorkstationStatusText(ws.status);
            
            html += `
                <div class="workstation-item-enhanced">
                    <div class="workstation-header">
                        <div class="workstation-title">
                            <h6 class="workstation-name">
                                <i class="fa fa-industry text-primary"></i>
                                ${ws.name}
                            </h6>
                            <span class="workstation-status-badge ${statusClass}">
                                <i class="${statusIcon}"></i>
                                ${statusText}
                            </span>
                        </div>
                        <span class="utilization-badge ${utilizationClass}">
                            ${utilizationPercent}%
                        </span>
                    </div>
                    
                    <div class="workstation-metrics">
                        <div class="metric-row">
                            <div class="metric">
                                <span class="metric-label">کارمندان فعال:</span>
                                <span class="metric-value ${(ws.current_active || 0) > 0 ? 'text-success' : 'text-muted'}">${ws.current_active || 0} / ${ws.active_employees || 0}</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">کارهای فعال:</span>
                                <span class="metric-value ${(ws.active_jobs || 0) > 0 ? 'text-primary' : 'text-muted'}">${ws.active_jobs || 0}</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">صف انتظار:</span>
                                <span class="metric-value">${ws.queue_length || 0}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="utilization-bar">
                        <div class="utilization-fill ${utilizationClass}" style="width: ${utilizationPercent}%"></div>
                    </div>
                    
                    ${ws.employees && ws.employees.length > 0 ? `
                        <div class="workstation-employees">
                            <div class="employees-header">
                                <small class="text-muted"><i class="fa fa-users"></i> کارمندان:</small>
                            </div>
                            <div class="employees-list">
                                ${ws.employees.map(emp => {
                                    const workHours = emp.end_time && emp.start_time ? 
                                        Math.round(((new Date(emp.end_time) - new Date(emp.start_time)) / (1000 * 60 * 60)) * 100) / 100 : 0;
                                    return `
                                        <div class="employee-workstation-item">
                                            <div class="employee-name">${emp.employee_name}</div>
                                            <div class="employee-details">
                                                <small class="text-muted">
                                                    ${emp.department || ''} | ${workHours} ساعت | ${emp.jobs_count || 0} کار
                                                </small>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${ws.active_job_details && ws.active_job_details.length > 0 ? `
                        <div class="active-jobs-section">
                            <div class="jobs-header">
                                <small class="text-success"><i class="fa fa-play"></i> کارهای در حال انجام:</small>
                            </div>
                            <div class="active-jobs-list">
                                ${ws.active_job_details.map(job => `
                                    <div class="active-job-item">
                                        <strong>${job.job_card}</strong>
                                        <span class="job-employee">${job.employee_name}</span>
                                        <small class="text-muted">${job.operation}</small>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${ws.queue_details && ws.queue_details.length > 0 ? `
                        <div class="queue-section">
                            <div class="queue-header">
                                <small class="text-warning"><i class="fa fa-hourglass-half"></i> صف انتظار:</small>
                            </div>
                            <div class="queue-list">
                                ${ws.queue_details.map(job => `
                                    <div class="queue-item">
                                        <span class="queue-job">${job.job_card}</span>
                                        <small class="text-muted">${job.operation}</small>
                                    </div>
                                `).join('')}
                                ${ws.queue_length > 5 ? `<small class="text-muted">... و ${ws.queue_length - 5} کار دیگر</small>` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        container.html(html);
    }
    
    /**
     * شروع بروزرسانی خودکار
     */
    init_realtime_updates() {
        // پاکسازی تایمر قبلی
        if (this.realtime_timer) {
            clearInterval(this.realtime_timer);
        }
        
        // بروزرسانی خودکار فقط اگر تاریخ امروز باشه
        if (this.selected_date === frappe.datetime.get_today()) {
            this.realtime_timer = setInterval(() => {
                if (this.parent.current_tab === 'realtime') {
                    this.load_realtime_data();
                }
            }, 30000);
        }
    }
    
    /**
     * بروزرسانی زمان آخرین به‌روزرسانی
     */
    update_last_update_time() {
        const now = frappe.datetime.now_datetime();
        this.parent.page.main.find('#last-update-time').text(frappe.datetime.str_to_user(now));
    }
    
    /**
     * متدهای کمکی برای وضعیت کارمندان
     */
    getStatusClass(status) {
        const statusMap = {
            'working': 'status-working',
            'idle': 'status-idle',
            'on_break': 'status-break',
            'offline': 'status-offline'
        };
        return statusMap[status] || 'status-unknown';
    }
    
    getStatusIcon(status) {
        const iconMap = {
            'working': 'fa fa-user-cog',
            'idle': 'fa fa-user-clock',
            'on_break': 'fa fa-coffee',
            'offline': 'fa fa-user-times'
        };
        return iconMap[status] || 'fa fa-user';
    }
    
    getStatusText(status) {
        const textMap = {
            'working': 'در حال کار',
            'idle': 'بیکار',
            'on_break': 'استراحت',
            'offline': 'غایب'
        };
        return textMap[status] || 'نامشخص';
    }
    
    /**
     * متدهای کمکی برای وضعیت ایستگاه‌ها
     */
    getWorkstationStatusClass(status) {
        const statusMap = {
            'active': 'ws-active',
            'recently_active': 'ws-recent',
            'idle': 'ws-idle'
        };
        return statusMap[status] || 'ws-unknown';
    }
    
    getWorkstationStatusIcon(status) {
        const iconMap = {
            'active': 'fa fa-play-circle',
            'recently_active': 'fa fa-pause-circle',
            'idle': 'fa fa-stop-circle'
        };
        return iconMap[status] || 'fa fa-question-circle';
    }
    
    getWorkstationStatusText(status) {
        const textMap = {
            'active': 'فعال',
            'recently_active': 'اخیراً فعال',
            'idle': 'غیرفعال'
        };
        return textMap[status] || 'نامشخص';
    }
    
    /**
     * پاکسازی تایمر هنگام خروج از تب
     */
    destroy() {
        if (this.realtime_timer) {
            clearInterval(this.realtime_timer);
            this.realtime_timer = null;
        }
    }
}

// متد سراسری برای دسترسی از HTML
window.realtimeTab = null;
/**
 * کلاس تب مسیر کاری (Workpath)
 * نمایش مسیر حرکت کارمندان در ایستگاه‌های مختلف
 */

/**
 * کلاس تب مسیر کاری (Workpath)
 * نمایش مسیر حرکت کارمندان در ایستگاه‌های مختلف با نمای گانت
 */
class WorkpathTab {
    constructor(parent) {
        this.parent = parent;
    }
    
    /**
     * دریافت HTML تب مسیر کاری
     */
    get_html() {
        return `
            <div class="workpath-dashboard">
                <div class="row mb-3">
                    <div class="col-md-12">
                        <div class="workpath-filters">
                            <div class="row">
                                <div class="col-md-3">
                                    <label>تاریخ انتخابی</label>
                                    <input type="date" class="form-control" id="workpath-date" value="${frappe.datetime.get_today()}">
                                </div>
                                <div class="col-md-3">
                                    <label>&nbsp;</label>
                                    <button class="btn btn-primary form-control" id="refresh-workpath">
                                        بروزرسانی مسیرها
                                    </button>
                                </div>
                                <div class="col-md-6">
                                    <label>&nbsp;</label>
                                    <div class="btn-group form-control" role="group">
                                        <button type="button" class="btn btn-outline-secondary active" id="view-gantt">
                                            <i class="fa fa-chart-bar"></i> نمای گانت
                                        </button>
                                        <button type="button" class="btn btn-outline-secondary" id="view-timeline">
                                            <i class="fa fa-list-alt"></i> نمای فهرستی
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-12">
                        <div class="work-paths-container"></div>
                    </div>
                </div>
                
                <style>
                    .gantt-chart {
                        overflow-x: auto;
                        background: #f8f9fa;
                        border-radius: 8px;
                        padding: 20px;
                        margin-top: 20px;
                        min-width: 1200px;
                    }
                    
                    .gantt-header {
                        display: flex;
                        margin-bottom: 20px;
                        background: white;
                        border-radius: 6px;
                        padding: 10px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        width: 100%;
                    }
                    
                    .gantt-time-header {
                        flex: 1;
                        display: flex;
                        border-right: 2px solid #dee2e6;
                        min-width: 800px;
                    }
                    
                    .gantt-employee-label {
                        width: 200px;
                        min-width: 200px;
                        font-weight: bold;
                        display: flex;
                        align-items: center;
                        padding: 0 15px;
                        background: #e9ecef;
                        border-radius: 4px;
                        flex-shrink: 0;
                    }
                    
                    .time-slot {
                        flex: 1;
                        min-width: 80px;
                        text-align: center;
                        font-size: 12px;
                        color: #6c757d;
                        border-left: 1px solid #dee2e6;
                        padding: 5px;
                        white-space: nowrap;
                    }
                    
                    .gantt-row {
                        display: flex;
                        margin-bottom: 15px;
                        background: white;
                        border-radius: 6px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        min-height: 60px;
                        width: 100%;
                    }
                    
                    .gantt-employee-info {
                        width: 200px;
                        min-width: 200px;
                        padding: 15px;
                        border-right: 2px solid #dee2e6;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        flex-shrink: 0;
                        text-align: right;
                    }
                    
                    .gantt-employee-name {
                        font-weight: bold;
                        color: #495057;
                        font-size: 14px;
                    }
                    
                    .gantt-employee-id {
                        font-size: 11px;
                        color: #6c757d;
                        margin-top: 2px;
                    }
                    
                    .gantt-timeline {
                        flex: 1;
                        position: relative;
                        padding: 10px 0;
                        min-width: 800px;
                        overflow: visible;
                    }
                    
                    .gantt-bar {
                        position: absolute;
                        height: 40px;
                        border-radius: 20px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                        min-width: 4px;
                        box-sizing: border-box;
                        border: 2px solid rgba(255,255,255,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                    }
                    
                    .gantt-bar:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                        z-index: 10;
                        border: 2px solid rgba(255,255,255,0.8);
                    }
                    
                    .bar-text {
                        color: white;
                        font-weight: bold;
                        font-size: 11px;
                        white-space: nowrap;
                        text-overflow: ellipsis;
                        overflow: hidden;
                        text-align: center;
                        width: 100%;
                    }
                    
                    .workstation-color-1 { background: linear-gradient(45deg, #007bff, #0056b3); }
                    .workstation-color-2 { background: linear-gradient(45deg, #28a745, #1e7e34); }
                    .workstation-color-3 { background: linear-gradient(45deg, #dc3545, #c82333); }
                    .workstation-color-4 { background: linear-gradient(45deg, #ffc107, #e0a800); }
                    .workstation-color-5 { background: linear-gradient(45deg, #17a2b8, #138496); }
                    .workstation-color-6 { background: linear-gradient(45deg, #6f42c1, #59359a); }
                    .workstation-color-7 { background: linear-gradient(45deg, #fd7e14, #e55a00); }
                    .workstation-color-8 { background: linear-gradient(45deg, #e83e8c, #d91a72); }
                    
                    .gantt-tooltip {
                        position: absolute;
                        background: #333;
                        color: white;
                        padding: 10px;
                        border-radius: 4px;
                        font-size: 12px;
                        z-index: 1000;
                        pointer-events: none;
                        max-width: 300px;
                    }
                    
                    .workstation-legend {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        margin-bottom: 20px;
                        padding: 15px;
                        background: white;
                        border-radius: 6px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    
                    .legend-item {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                    }
                    
                    .legend-color {
                        width: 20px;
                        height: 20px;
                        border-radius: 10px;
                    }
                    
                    .workstation-flow-container {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 15px;
                    }
                    
                    .workstation-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    
                    .workstation-card {
                        background: #f8f9fa;
                        border: 2px solid #dee2e6;
                        border-radius: 8px;
                        padding: 15px;
                        min-width: 150px;
                        text-align: center;
                    }
                    
                    .workstation-icon {
                        font-size: 24px;
                        color: #007bff;
                        margin-bottom: 8px;
                    }
                    
                    .workstation-stats {
                        display: flex;
                        gap: 5px;
                        justify-content: center;
                        margin-top: 8px;
                    }
                    
                    .workstation-arrow {
                        color: #6c757d;
                        font-size: 18px;
                    }
                    
                    .job-cards-flow {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .job-card-item {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 10px;
                    }
                    
                    .job-card-details {
                        background: #fff;
                        border: 1px solid #dee2e6;
                        border-radius: 6px;
                        padding: 15px;
                        width: 100%;
                    }
                    
                    .job-card-header {
                        display: flex;
                        justify-content: between;
                        align-items: center;
                        margin-bottom: 10px;
                    }
                    
                    .job-card-body {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .job-operation, .job-workstation, .job-time {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    .job-arrow {
                        color: #6c757d;
                        font-size: 16px;
                    }
                </style>
            </div>
        `;
    }
    
    /**
     * رندر کردن محتوای تب
     */
    render() {
        this.current_view = 'gantt';
        this.render_work_paths();
        this.setup_refresh_button();
        this.setup_view_toggles();
    }
    
    /**
     * تنظیم دکمه‌های تغییر نما
     */
    setup_view_toggles() {
        this.parent.page.main.find('#view-gantt').on('click', () => {
            this.current_view = 'gantt';
            this.parent.page.main.find('.btn-group .btn').removeClass('active');
            this.parent.page.main.find('#view-gantt').addClass('active');
            this.render_work_paths();
        });
        
        this.parent.page.main.find('#view-timeline').on('click', () => {
            this.current_view = 'timeline';
            this.parent.page.main.find('.btn-group .btn').removeClass('active');
            this.parent.page.main.find('#view-timeline').addClass('active');
            this.render_work_paths();
        });
    }
    
    /**
     * نمایش مسیرهای کاری
     */
    render_work_paths() {
        const container = this.parent.page.main.find('.work-paths-container');
        const employee_paths = this.parent.data?.employee_paths || {};
        
        // بررسی و تصفیه داده‌ها
        const cleaned_paths = {};
        Object.keys(employee_paths).forEach(emp_id => {
            const paths = employee_paths[emp_id];
            if (Array.isArray(paths) && paths.length > 0) {
                const valid_paths = paths.filter(path => 
                    path.workstation && path.operation && path.job_card
                );
                if (valid_paths.length > 0) {
                    // مرتب‌سازی بر اساس زمان شروع
                    valid_paths.sort((a, b) => {
                        const timeA = a.from_time ? new Date(a.from_time) : new Date();
                        const timeB = b.from_time ? new Date(b.from_time) : new Date();
                        return timeA - timeB;
                    });
                    cleaned_paths[emp_id] = this.merge_consecutive_workstations(valid_paths);
                }
            }
        });

        if (Object.keys(cleaned_paths).length === 0) {
            container.html('<p class="text-muted text-center">هیچ مسیر کاری برای تاریخ انتخابی یافت نشد</p>');
            return;
        }

        if (this.current_view === 'gantt') {
            this.render_gantt_view(container, cleaned_paths);
        } else {
            this.render_timeline_view(container, cleaned_paths);
        }
    }
    
    /**
     * ادغام ایستگاه‌های متوالی یکسان
     */
    merge_consecutive_workstations(paths) {
        if (paths.length <= 1) return paths;
        
        const merged = [];
        let current_group = [paths[0]];
        
        for (let i = 1; i < paths.length; i++) {
            const current = paths[i];
            const previous = paths[i-1];
            
            // اگر ایستگاه کار یکسان است و زمان‌ها متوالی هستند
            if (current.workstation === previous.workstation && 
                this.are_times_consecutive(previous.to_time, current.from_time)) {
                current_group.push(current);
            } else {
                // گروه قبلی را ادغام کن
                merged.push(this.merge_job_group(current_group));
                current_group = [current];
            }
        }
        
        // آخرین گروه را ادغام کن
        merged.push(this.merge_job_group(current_group));
        
        return merged;
    }
    
    /**
     * بررسی اینکه آیا دو زمان متوالی هستند
     */
    are_times_consecutive(end_time, start_time, tolerance_minutes = 30) {
        if (!end_time || !start_time) return true; // اگر زمان نداریم، فرض کن متوالی است
        
        try {
            const end = new Date(end_time);
            const start = new Date(start_time);
            const diff_minutes = (start - end) / (1000 * 60);
            return diff_minutes <= tolerance_minutes && diff_minutes >= 0;
        } catch (e) {
            return true;
        }
    }
    
    /**
     * ادغام گروهی از کارها در یک ایستگاه
     */
    merge_job_group(job_group) {
        if (job_group.length === 1) return job_group[0];
        
        const first = job_group[0];
        const last = job_group[job_group.length - 1];
        
        // محاسبه مجموع مدت زمان
        let total_duration = 0;
        job_group.forEach(job => {
            total_duration += job.duration_mins || 0;
        });
        
        // اگر مدت زمان کل صفر است، از زمان شروع و پایان محاسبه کن
        if (total_duration === 0 && first.from_time && last.to_time) {
            try {
                const start = new Date(first.from_time);
                const end = new Date(last.to_time);
                total_duration = Math.floor((end - start) / (1000 * 60));
            } catch (e) {
                total_duration = job_group.length * 30; // فرض کن هر کار 30 دقیقه
            }
        }
        
        return {
            ...first,
            to_time: last.to_time || first.to_time,
            duration_mins: total_duration || job_group.length * 30,
            job_cards: job_group.map(job => job.job_card).join(', '),
            job_count: job_group.length,
            merged: true
        };
    }
    
    /**
     * رندر نمای گانت
     */
    render_gantt_view(container, cleaned_paths) {
        // تعیین محدوده زمانی
        const time_range = this.calculate_time_range(cleaned_paths);
        const workstations = this.get_all_workstations(cleaned_paths);
        
        let html = `
            <div class="gantt-chart">
                ${this.render_workstation_legend(workstations)}
                ${this.render_gantt_header(time_range)}
                ${this.render_gantt_rows(cleaned_paths, time_range, workstations)}
            </div>
        `;
        
        container.html(html);
        this.setup_gantt_interactions();
    }
    
    /**
     * محاسبه محدوده زمانی
     */
    calculate_time_range(paths_data) {
        // ثابت: از 00:00 تا 24:00 (1440 دقیقه)
        const today = new Date();
        const min_time = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const max_time = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        
        return { min_time, max_time };
    }
    
    /**
     * دریافت تمام ایستگاه‌های کاری
     */
    get_all_workstations(paths_data) {
        const workstations = new Set();
        Object.values(paths_data).forEach(paths => {
            paths.forEach(path => {
                workstations.add(path.workstation);
            });
        });
        return Array.from(workstations);
    }
    
    /**
     * رندر راهنمای رنگ‌ها
     */
    render_workstation_legend(workstations) {
        let html = '<div class="workstation-legend">';
        workstations.forEach((workstation, index) => {
            const color_class = `workstation-color-${(index % 8) + 1}`;
            html += `
                <div class="legend-item">
                    <div class="legend-color ${color_class}"></div>
                    <span>${workstation}</span>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }
    
    /**
     * رندر هدر گانت
     */
    render_gantt_header(time_range) {
        let html = '<div class="gantt-header">';
        html += '<div class="gantt-employee-label">کارمند</div>';
        html += '<div class="gantt-time-header">';
        
        // نمایش 24 ساعت از 00:00 تا 23:00
        for (let hour = 0; hour < 24; hour++) {
            const time_str = hour.toString().padStart(2, '0') + ':00';
            html += `<div class="time-slot">${time_str}</div>`;
        }
        
        html += '</div></div>';
        return html;
    }
    
    /**
     * رندر سطرهای گانت
     */
    render_gantt_rows(paths_data, time_range, workstations) {
        let html = '';
        const total_minutes = (time_range.max_time - time_range.min_time) / (1000 * 60);
        
        Object.keys(paths_data).forEach(employee_id => {
            const paths = paths_data[employee_id];
            const employee_name = this.get_employee_name(employee_id);
            
            html += `
                <div class="gantt-row">
                    <div class="gantt-employee-info">
                        <div class="gantt-employee-name">${employee_name}</div>
                        <div class="gantt-employee-id">${employee_id}</div>
                    </div>
                    <div class="gantt-timeline">
                        ${this.render_gantt_bars(paths, time_range, total_minutes, workstations)}
                    </div>
                </div>
            `;
        });
        
        return html;
    }
    
    /**
     * رندر نوارهای گانت
     */
    render_gantt_bars(paths, time_range, total_minutes, workstations) {
        let html = '';
        
        // total_minutes حالا ثابت 1440 دقیقه (24 ساعت)
        const day_total_minutes = 24 * 60; // 1440 دقیقه
        
        paths.forEach((path, index) => {
            if (!path.from_time) return;
            
            const start_time = new Date(path.from_time);
            let end_time;
            let actual_duration_mins = 0;
            
            // تعیین زمان پایان و محاسبه مدت واقعی
            if (path.to_time) {
                end_time = new Date(path.to_time);
                actual_duration_mins = Math.floor((end_time - start_time) / (1000 * 60));
            } else if (path.duration_mins) {
                actual_duration_mins = path.duration_mins;
                end_time = new Date(start_time.getTime() + actual_duration_mins * 60 * 1000);
            } else {
                // پیش‌فرض 30 دقیقه
                actual_duration_mins = 30;
                end_time = new Date(start_time.getTime() + 30 * 60 * 1000);
            }
            
            // اطمینان از مدت حداقل
            if (actual_duration_mins <= 0) {
                actual_duration_mins = 15; // حداقل 15 دقیقه
                end_time = new Date(start_time.getTime() + 15 * 60 * 1000);
            }
            
            // محاسبه موقعیت بر اساس ساعت روز (از 00:00)
            const start_hour = start_time.getHours();
            const start_minute = start_time.getMinutes();
            const start_total_minutes = (start_hour * 60) + start_minute;
            const start_percentage = (start_total_minutes / day_total_minutes) * 100;
            
            // محاسبه عرض بر اساس مدت واقعی
            const width_percentage = (actual_duration_mins / day_total_minutes) * 100;
            const final_width = Math.max(width_percentage, 0.5); // حداقل عرض 0.5%
            
            const workstation_index = workstations.indexOf(path.workstation);
            const color_class = `workstation-color-${(workstation_index % 8) + 1}`;
            
            const tooltip_data = this.create_tooltip_data(path);
            tooltip_data.calculated_duration = actual_duration_mins;
            
            // تعیین اینکه آیا متن جا می‌شود یا نه
            const min_width_for_text = 60; // حداقل پیکسل برای نمایش متن
            const bar_width_pixels = (final_width / 100) * 800; // فرض: عرض تایم لاین 800 پیکسل
            
            let inner_html = '';
            if (bar_width_pixels >= min_width_for_text) {
                let display_text = path.workstation;
                if (path.merged && path.job_count > 1) {
                    display_text += ` (${path.job_count})`;
                }
                inner_html = `<span class="bar-text">${display_text}</span>`;
            }
            
            html += `
                <div class="gantt-bar ${color_class}" 
                     style="left: ${Math.max(start_percentage, 0)}%; width: ${final_width}%;"
                     data-tooltip='${JSON.stringify(tooltip_data)}'
                     data-duration="${actual_duration_mins}"
                     title="${path.workstation} - ${actual_duration_mins} دقیقه">
                     ${inner_html}
                </div>
            `;
        });
        
        return html;
    }
    
    /**
     * ایجاد داده‌های tooltip
     */
    create_tooltip_data(path) {
        return {
            workstation: path.workstation,
            operation: path.operation,
            job_cards: path.job_cards || path.job_card,
            duration: path.duration_mins || 0,
            start_time: path.from_time,
            end_time: path.to_time,
            job_count: path.job_count || 1,
            merged: path.merged || false
        };
    }
    
    /**
     * تنظیم تعامل‌های گانت
     */
    setup_gantt_interactions() {
        let tooltip = null;
        
        this.parent.page.main.find('.gantt-bar').on('mouseenter', function(e) {
            const data = JSON.parse($(this).attr('data-tooltip'));
            const calculated_duration = $(this).attr('data-duration');
            
            if (tooltip) tooltip.remove();
            
            const duration_text = calculated_duration ? `${calculated_duration} دقیقه` : 
                                  (data.duration ? `${data.duration} دقیقه` : 'نامشخص');
            
            tooltip = $(`
                <div class="gantt-tooltip">
                    <strong>${data.workstation}</strong><br>
                    عملیات: ${data.operation}<br>
                    کارت(ها): ${data.job_cards}<br>
                    مدت کار: ${duration_text}<br>
                    شروع: ${data.start_time ? new Date(data.start_time).toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'}) : 'نامشخص'}<br>
                    پایان: ${data.end_time ? new Date(data.end_time).toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'}) : 'نامشخص'}
                    ${data.job_count > 1 ? `<br>تعداد کارها: ${data.job_count} (ادغام شده)` : ''}
                </div>
            `);
            
            $('body').append(tooltip);
            
            tooltip.css({
                left: e.pageX + 10,
                top: e.pageY - tooltip.height() - 10
            });
        }).on('mouseleave', function() {
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
        }).on('mousemove', function(e) {
            if (tooltip) {
                tooltip.css({
                    left: e.pageX + 10,
                    top: e.pageY - tooltip.height() - 10
                });
            }
        });
    }
    
    /**
     * رندر نمای فهرستی (کد قبلی)
     */
    render_timeline_view(container, cleaned_paths) {
        let html = '<div class="work-paths-accordion">';

        Object.keys(cleaned_paths).forEach((employee_id, index) => {
            const paths = cleaned_paths[employee_id];
            const employee_name = this.get_employee_name(employee_id);
            const workstation_flow = this.group_paths_by_workstation_timeline(paths);
            
            html += `
                <div class="card employee-work-card mb-3">
                    <div class="card-header p-0">
                        <button class="btn btn-link btn-block text-left collapsed employee-toggle" 
                                type="button" data-toggle="collapse" 
                                data-target="#workpath-collapse-${index}" 
                                aria-expanded="false" 
                                aria-controls="workpath-collapse-${index}">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="employee-header-info">
                                    <strong>${employee_name}</strong>
                                    <small class="text-muted d-block">شناسه: ${employee_id}</small>
                                </div>
                                <div class="employee-stats">
                                    <span class="badge badge-info">${workstation_flow.length} ایستگاه</span>
                                    <span class="badge badge-secondary">${paths.reduce((sum, path) => sum + (path.job_count || 1), 0)} کار</span>
                                    <i class="fa fa-chevron-down toggle-icon ml-2"></i>
                                </div>
                            </div>
                        </button>
                    </div>
                    <div id="workpath-collapse-${index}" 
                        class="collapse" 
                        data-parent=".work-paths-accordion">
                        <div class="card-body">
                            <div class="workstation-flow-section">
                                <h6 class="section-title">
                                    <i class="fa fa-route text-primary"></i>
                                    مسیر ایستگاه‌های کاری
                                </h6>
                                <div class="workstation-timeline">
                                    ${this.render_workstation_timeline(workstation_flow)}
                                </div>
                            </div>
                            
                            <div class="job-details-section mt-4">
                                <h6 class="section-title">
                                    <i class="fa fa-tasks text-success"></i>
                                    جزئیات کارها
                                </h6>
                                <div class="job-cards-timeline">
                                    ${this.render_job_cards_timeline(paths)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

        });
        
        html += '</div>';
        container.html(html);
        container.off("click", ".employee-card-collapsible").on("click", ".employee-card-collapsible", (e) => {
            const employee_id = $(e.currentTarget).data("employee-id"); 
            this.toggle_employee_details(employee_id);
        });
        // تغییر آیکون chevron هنگام باز و بسته شدن
        container.find('.collapse').on('show.bs.collapse', function() {
            $(this).prev('.card-header').find('.toggle-icon')
                .removeClass('fa-chevron-down')
                .addClass('fa-chevron-up');
        });
        container.find('.collapse').on('hide.bs.collapse', function() {
            $(this).prev('.card-header').find('.toggle-icon')
                .removeClass('fa-chevron-up')
                .addClass('fa-chevron-down');
        });
        
        this.setup_toggle_animations();
    }
    
    // باقی توابع مثل قبل...
    
    /**
     * تابع کمکی برای مدیریت داده‌های خالی
     */
    safe_get_value(obj, key, default_value = 'نامشخص') {
        return (obj && obj[key] !== null && obj[key] !== undefined) ? obj[key] : default_value;
    }

    /**
     * محاسبه مدت زمان از روی timestamps
     */
    calculate_duration(start_time, end_time) {
        if (!start_time || !end_time) return 0;
        try {
            const start = new Date(start_time);
            const end = new Date(end_time);
            return Math.floor((end - start) / (1000 * 60));
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * تنظیم دکمه بروزرسانی
     */
    setup_refresh_button() {
        this.parent.page.main.find('#refresh-workpath').off('click').on('click', () => {
            const selected_date = this.parent.page.main.find('#workpath-date').val();
            this.load_work_paths_for_date(selected_date);
        });
    }
    
    /**
     * بارگذاری مسیرهای کاری برای تاریخ خاص
     */
    load_work_paths_for_date(selected_date) {
        const filters = {
            from_date: selected_date,
            to_date: selected_date,
            employee: this.parent.page.fields_dict.employee.get_value(),
            workstation: this.parent.page.fields_dict.workstation.get_value()
        };
        
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_employee_productivity_data',
            args: { filters: filters },
            callback: (r) => {
                if (r.message) {
                    this.parent.data.employee_paths = r.message.employee_paths;
                    this.render_work_paths();
                }
            }
        });
    }
    
    /**
     * دریافت نام کارمند
     */
    get_employee_name(employee_id) {
        if (this.parent.employees_cache && this.parent.employees_cache[employee_id]) {
            return this.parent.employees_cache[employee_id];
        }

        frappe.db.get_value('Employee', employee_id, 'employee_name')
            .then(r => {
                if (r.message && r.message.employee_name) {
                    if (!this.parent.employees_cache) {
                        this.parent.employees_cache = {};
                    }
                    this.parent.employees_cache[employee_id] = r.message.employee_name;
                }
            });

        return employee_id;
    }
    
    /**
     * گروه‌بندی مسیرها بر اساس ایستگاه کاری (برای نمای فهرستی)
     */
    group_paths_by_workstation_timeline(paths) {
        const workstation_flow = [];
        const workstation_groups = {};
        
        // گروه‌بندی بر اساس ایستگاه
        paths.forEach(path => {
            if (!workstation_groups[path.workstation]) {
                workstation_groups[path.workstation] = {
                    workstation: path.workstation,
                    duration_mins: 0,
                    job_count: 0,
                    jobs: []
                };
            }
            
            const group = workstation_groups[path.workstation];
            group.duration_mins += path.duration_mins || 30;
            group.job_count += path.job_count || 1;
            group.jobs.push(path);
        });
        
        // تبدیل به آرایه و مرتب‌سازی بر اساس زمان شروع
        Object.values(workstation_groups).forEach(group => {
            // مرتب‌سازی کارها در داخل هر ایستگاه
            group.jobs.sort((a, b) => {
                const timeA = a.from_time ? new Date(a.from_time) : new Date();
                const timeB = b.from_time ? new Date(b.from_time) : new Date();
                return timeA - timeB;
            });
            workstation_flow.push(group);
        });
        
        // مرتب‌سازی ایستگاه‌ها بر اساس اولین زمان شروع
        workstation_flow.sort((a, b) => {
            const timeA = a.jobs[0]?.from_time ? new Date(a.jobs[0].from_time) : new Date();
            const timeB = b.jobs[0]?.from_time ? new Date(b.jobs[0].from_time) : new Date();
            return timeA - timeB;
        });
        
        return workstation_flow;
    }
    
    /**
     * رندر خط زمانی ایستگاه‌ها
     */
    render_workstation_timeline(workstation_flow) {
        let html = '<div class="workstation-flow-container">';
        
        workstation_flow.forEach((station, index) => {
            const hours = Math.floor(station.duration_mins / 60);
            const minutes = station.duration_mins % 60;
            const duration_text = hours > 0 ? `${hours}س ${minutes}د` : `${minutes}د`;
            
            html += `
                <div class="workstation-item">
                    <div class="workstation-card">
                        <div class="workstation-icon">
                            <i class="fa fa-industry"></i>
                        </div>
                        <div class="workstation-info">
                            <strong>${station.workstation}</strong>
                            <div class="workstation-stats">
                                <span class="badge badge-primary">${duration_text}</span>
                                <span class="badge badge-secondary">${station.job_count} کار</span>
                            </div>
                        </div>
                    </div>
                    ${index < workstation_flow.length - 1 ? '<div class="workstation-arrow"><i class="fa fa-arrow-left"></i></div>' : ''}
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }
    
    /**
     * رندر خط زمانی کارت‌های کار
     */
    render_job_cards_timeline(paths) {
        let html = '<div class="job-cards-flow">';
        
        paths.forEach((path, index) => {
            const duration_text = path.duration_mins ? `${path.duration_mins}د` : 'نامشخص';
            const start_time = path.from_time ? 
                new Date(path.from_time).toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'}) : 
                'نامشخص';
            const end_time = path.to_time ? 
                new Date(path.to_time).toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'}) : 
                'نامشخص';
            
            // نمایش اطلاعات اضافی برای کارهای ادغام شده
            const job_info = path.merged ? 
                `${path.job_cards} (${path.job_count} کار ادغام شده)` : 
                path.job_card;
                        
            html += `
                <div class="job-card-item">
                    <div class="job-card-details ${path.merged ? 'merged-job' : ''}">
                        <div class="job-card-header">
                            <strong>${job_info}</strong>
                            <span class="badge badge-info">${duration_text}</span>
                            ${path.merged ? '<span class="badge badge-warning">ادغام شده</span>' : ''}
                        </div>
                        <div class="job-card-body">
                            <div class="job-operation">
                                <i class="fa fa-cogs text-primary"></i>
                                <span>${path.operation}</span>
                            </div>
                            <div class="job-workstation">
                                <i class="fa fa-map-marker-alt text-success"></i>
                                <span>${path.workstation}</span>
                            </div>
                            <div class="job-time">
                                <i class="fa fa-clock text-muted"></i>
                                <small>${start_time} ← ${end_time}</small>
                            </div>
                        </div>
                    </div>
                    ${index < paths.length - 1 ? '<div class="job-arrow"><i class="fa fa-chevron-down"></i></div>' : ''}
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }
    
    /**
     * تنظیم انیمیشن‌های toggle
     */
    setup_toggle_animations() {
        this.parent.page.main.find('.employee-toggle').on('click', function() {
            $(this).find('.toggle-icon').toggleClass('fa-chevron-down fa-chevron-up');
        });
    }
}


/**
 * کلاس تب وضعیت ایستگاه‌ها (Workstation Status)
 * نمایش وضعیت تفصیلی ایستگاه‌های کاری
 */


class WorkstationStatusTab {
    constructor(parent) {
        this.parent = parent;
        this.summary_data = null;
        this.departments_data = null;
    }
    
    /**
     * دریافت HTML تب وضعیت ایستگاه‌ها
     */
/**
 * دریافت HTML تب وضعیت ایستگاه‌ها - اصلاح شده
 */
get_html() {
    return `
        <div class="workstation-status-dashboard">
            <div class="row mb-3">
                <div class="col-md-12">
                    <div class="production-summary-indicators">
                        <div class="alert alert-info text-center">
                            <i class="fa fa-spinner fa-spin"></i> در حال بارگذاری آمار...
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mb-3">
                <div class="col-md-12">
                    <div class="workstation-filters">
                        <div class="btn-group" role="group">
                            <button type="button" class="btn btn-outline-primary active" data-filter="all">همه</button>
                            <button type="button" class="btn btn-outline-warning" data-filter="high-load">بار بالا</button>
                            <button type="button" class="btn btn-outline-danger" data-filter="delayed">تاخیردار</button>
                            <button type="button" class="btn btn-outline-secondary" data-filter="stuck">ایست‌خورده</button>
                        </div>
                        <div class="float-right">
                            <button class="btn btn-primary" id="refresh-workstation-status">
                                <i class="fa fa-sync"></i> بروزرسانی
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-12">
                    <div class="departments-container">
                        <div class="alert alert-info text-center">
                            <i class="fa fa-spinner fa-spin"></i> در حال بارگذاری بخش‌ها...
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <style>
            /* استایل‌های مخصوص workstation status */
            .production-indicators {
                margin-bottom: 20px;
            }
            
            .indicator-card {
                background: white;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                display: flex;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .indicator-card.workload { border-left: 4px solid #17a2b8; }
            .indicator-card.pending { border-left: 4px solid #ffc107; }
            .indicator-card.active { border-left: 4px solid #28a745; }
            .indicator-card.stuck { border-left: 4px solid #dc3545; }
            
            .indicator-icon {
                font-size: 2rem;
                margin-left: 15px;
                opacity: 0.8;
            }
            
            .indicator-content h3 {
                margin: 0;
                font-size: 2rem;
                font-weight: bold;
            }
            
            .indicator-content p {
                margin: 5px 0 0 0;
                opacity: 0.8;
            }
            
            .department-card {
                background: white;
                border-radius: 10px;
                margin-bottom: 15px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            .department-header {
                padding: 15px 20px;
                border-bottom: 1px solid #e9ecef;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .department-header:hover {
                background-color: #f8f9fa;
            }
            
            .department-stats {
                display: flex;
                gap: 5px;
            }
            
            .workstations-grid {
                padding: 15px;
            }
            
            .workstation-card {
                background: white;
                border-radius: 8px;
                padding: 15px;
                border: 1px solid #e9ecef;
                transition: all 0.3s ease;
            }
            
            .workstation-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            
            .workstation-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .status-badge {
                font-size: 0.85rem;
            }
            
            .stat-item {
                text-align: center;
                margin-bottom: 10px;
            }
            
            .stat-number {
                display: block;
                font-size: 1.2rem;
                font-weight: bold;
            }
            
            .stat-label {
                display: block;
                font-size: 0.8rem;
                opacity: 0.7;
            }
        </style>`;
}

/**
 * رندر آمار کلی تولید - اصلاح شده
 */
    render_production_summary() {
        console.log('Rendering production summary with data:', this.summary_data);
        const container = this.parent.page.main.find('.production-summary-indicators');
        
        if (container.length === 0) {
            console.error('production-summary-indicators container not found!');
            // تلاش برای پیدا کردن container در کل DOM
            const fallbackContainer = $('.production-summary-indicators');
            if (fallbackContainer.length === 0) {
                console.error('Container not found even in fallback search');
                return;
            }
            console.log('Using fallback container');
        }

        const data = this.summary_data;
        if (!data) {
            console.log('No summary data available');
            this.show_summary_error();
            return;
        }
        
        const html = `
            <div class="production-indicators">
                <div class="row">
                    <div class="col-md-3">
                        <div class="indicator-card workload">
                            <div class="indicator-icon"><i class="fa fa-clock"></i></div>
                            <div class="indicator-content">
                                <h3>${data.total_pending_hours ? data.total_pending_hours.toFixed(1) : '0.0'}</h3>
                                <p>ساعت کار باقی‌مانده</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="indicator-card pending">
                            <div class="indicator-icon"><i class="fa fa-hourglass-half"></i></div>
                            <div class="indicator-content">
                                <h3>${data.total_pending_jobs || 0}</h3>
                                <p>کارت در انتظار</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="indicator-card active">
                            <div class="indicator-icon"><i class="fa fa-cogs"></i></div>
                            <div class="indicator-content">
                                <h3>${data.total_in_progress || 0}</h3>
                                <p>در حال انجام</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="indicator-card stuck">
                            <div class="indicator-icon"><i class="fa fa-exclamation-triangle"></i></div>
                            <div class="indicator-content">
                                <h3>${data.total_stuck_jobs || 0}</h3>
                                <p>ایست‌خورده</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // استفاده از container یافت شده یا fallback
        const targetContainer = container.length > 0 ? container : $('.production-summary-indicators');
        targetContainer.html(html);
        
        console.log('Summary HTML rendered successfully');
    }

    /**
     * رندر لیست بخش‌ها - اصلاح شده
     */
    render_departments_list() {
        console.log('Rendering departments list with data:', this.departments_data);
        const container = this.parent.page.main.find('.departments-container');
        
        if (container.length === 0) {
            console.error('departments-container not found!');
            // تلاش برای پیدا کردن container در کل DOM
            const fallbackContainer = $('.departments-container');
            if (fallbackContainer.length === 0) {
                console.error('Departments container not found even in fallback search');
                return;
            }
        }
        
        const departments = this.departments_data;
        if (!departments || departments.length === 0) {
            const targetContainer = container.length > 0 ? container : $('.departments-container');
            targetContainer.html(`
                <div class="alert alert-warning text-center">
                    <i class="fa fa-info-circle"></i> هیچ بخش کاری فعالی یافت نشد
                </div>
            `);
            return;
        }
        
        let html = '<div class="departments-list">';
        
        departments.forEach((dept, index) => {
            const statusClass = dept.total_stuck > 0 ? 'dept-critical' : 
                            dept.total_pending > 10 ? 'dept-high-load' : 'dept-normal';
            
            html += `
                <div class="department-card ${statusClass}" data-dept-index="${index}">
                    <div class="department-header" data-dept="${dept.department_name}" data-index="${index}">
                        <div class="dept-title">
                            <h5><i class="fa fa-building"></i> ${dept.department_name}</h5>
                            <div class="workload-info">${dept.total_workload ? dept.total_workload.toFixed(1) : '0.0'} ساعت</div>
                        </div>
                        <div class="dept-info">
                            <div class="department-stats">
                                <span class="badge badge-secondary">${dept.workstation_count} ایستگاه</span>
                                <span class="badge badge-info">${dept.total_pending} انتظار</span>
                                <span class="badge badge-success">${dept.total_active} فعال</span>
                                ${dept.total_stuck > 0 ? `<span class="badge badge-danger">${dept.total_stuck} ایست</span>` : ''}
                            </div>
                            <i class="fa fa-chevron-down"></i>
                        </div>
                    </div>
                    <div class="department-content" id="dept-content-${index}" style="display:none;">
                        <div class="loading text-center p-3">
                            <i class="fa fa-spinner fa-spin"></i> در حال بارگذاری ایستگاه‌ها...
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // استفاده از container یافت شده یا fallback  
        const targetContainer = container.length > 0 ? container : $('.departments-container');
        targetContainer.html(html);
        
        console.log('Departments HTML rendered successfully');
        
        // bind click events
        this.setup_department_clicks();
    }

    /**
     * تنظیم کلیک departments - اصلاح شده
     */
    setup_department_clicks() {
        const self = this;
        
        // استفاده از event delegation برای اطمینان از کارکرد
        $(document).off('click.dept-header').on('click.dept-header', '.department-header', function() {
            const deptName = $(this).data('dept');
            const index = $(this).data('index');
            const contentDiv = $(`#dept-content-${index}`);
            const icon = $(this).find('.fa-chevron-down, .fa-chevron-up');
            
            console.log('Department clicked:', deptName, index);
            
            if (contentDiv.length === 0) {
                console.error('Content div not found for index:', index);
                return;
            }
            
            if (contentDiv.is(':visible')) {
                // بستن
                contentDiv.slideUp(300);
                icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
            } else {
                // باز کردن و بارگذاری
                contentDiv.slideDown(300);
                icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
                self.load_workstation_details(deptName, index);
            }
        });
    }

    /**
     * بارگذاری داده‌های وضعیت ایستگاه‌ها - اصلاح شده
     */
    load_workstation_status_data() {
        console.log('Loading workstation status data...');
        
        // بررسی وجود parent و filters
        if (!this.parent || !this.parent.get_filters) {
            console.error('Parent or get_filters method not available');
            this.show_loading_error();
            return;
        }
        
        const filters = this.parent.get_filters();
        
        // نمایش لودینگ
        this.show_loading();
        
        // شمارنده برای tracking درخواست‌ها
        let requestsCompleted = 0;
        let hasErrors = false;
        
        const checkCompletion = () => {
            requestsCompleted++;
            if (requestsCompleted === 2) {
                console.log('All requests completed. Errors:', hasErrors);
            }
        };
        
        // بارگذاری summary
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_workstation_status_summary',
            args: { filters: filters },
            callback: (r) => {
                console.log('Summary data received:', r);
                if (r && r.message && r.message.summary) {
                    this.summary_data = r.message.summary;
                    this.render_production_summary();
                } else {
                    console.error('Invalid summary response structure:', r);
                    hasErrors = true;
                    this.show_summary_error();
                }
                checkCompletion();
            },
            error: (err) => {
                console.error('Error loading summary data:', err);
                hasErrors = true;
                this.show_summary_error();
                checkCompletion();
            }
        });
        
        // بارگذاری departments
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_departments_with_workstations',
            args: { filters: filters },
            callback: (r) => {
                console.log('Departments data received:', r);
                if (r && r.message && r.message.departments) {
                    this.departments_data = r.message.departments;
                    this.render_departments_list();
                } else {
                    console.error('Invalid departments response structure:', r);
                    hasErrors = true;
                    this.show_departments_error();
                }
                checkCompletion();
            },
            error: (err) => {
                console.error('Error loading departments data:', err);
                hasErrors = true;
                this.show_departments_error();
                checkCompletion();
            }
        });
    }

    /**
     * نمایش خطای کلی لودینگ
     */
    show_loading_error() {
        const summaryContainer = $('.production-summary-indicators');
        const deptsContainer = $('.departments-container');
        
        const errorHtml = `
            <div class="alert alert-danger text-center">
                <i class="fa fa-exclamation-triangle"></i> خطا در بارگذاری داده‌ها
                <button class="btn btn-sm btn-outline-danger ml-2" onclick="location.reload()">
                    بارگذاری مجدد
                </button>
            </div>
        `;
        
        if (summaryContainer.length) summaryContainer.html(errorHtml);
        if (deptsContainer.length) deptsContainer.html(errorHtml);
    }
    
    /**
     * رندر کردن محتوای تب
     */
    render() {
        console.log('WorkstationStatusTab: Starting render');
        this.parent.page.main.html(this.get_html());   // ← این مهمه
        this.setup_event_listeners();
        setTimeout(() => {
            this.load_workstation_status_data();
        }, 100);
    }
    
    /**
     * تنظیم رویدادها
     */
    setup_event_listeners() {
        // دکمه بروزرسانی
        this.parent.page.main.find('#refresh-workstation-status').off('click').on('click', () => {
            console.log('Refresh button clicked');
            this.load_workstation_status_data();
        });
        
        // فیلترهای ایستگاه‌ها
        this.parent.page.main.find('.workstation-filters .btn').off('click').on('click', (e) => {
            const filter = $(e.target).data('filter');
            console.log('Filter clicked:', filter);
            this.filter_workstations(filter);
            
            // تغییر دکمه فعال
            $(e.target).siblings().removeClass('active');
            $(e.target).addClass('active');
        });
    }
    
    /**
     * بارگذاری داده‌های وضعیت ایستگاه‌ها
     */
    load_workstation_status_data() {
        console.log('Loading workstation status data...');
        const filters = this.parent.get_filters();
        
        // نمایش لودینگ
        this.show_loading();
        
        // اول summary رو بگیر
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_workstation_status_summary',
            args: { filters: filters },
            callback: (r) => {
                console.log('Summary data received:', r.message);
                if (r.message && r.message.summary) {
                    this.summary_data = r.message.summary;
                    this.render_production_summary();
                } else {
                    console.error('No summary data in response');
                    this.show_summary_error();
                }
            },
            error: (err) => {
                console.error('Error loading summary data:', err);
                this.show_summary_error();
            }
        });
        
        // بعد departments رو بگیر
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_departments_with_workstations',
            args: { filters: filters },
            callback: (r) => {
                console.log('Departments data received:', r.message);
                if (r.message && r.message.departments) {
                    this.departments_data = r.message.departments;
                    this.render_departments_list();
                } else {
                    console.error('No departments data in response');
                    this.show_departments_error();
                }
            },
            error: (err) => {
                console.error('Error loading departments data:', err);
                this.show_departments_error();
            }
        });
    }
    
    /**
     * نمایش لودینگ
     */
    show_loading() {
        this.parent.page.main.find('.production-summary-indicators').html(`
            <div class="alert alert-info text-center">
                <i class="fa fa-spinner fa-spin"></i> در حال بارگذاری آمار...
            </div>
        `);
        
        this.parent.page.main.find('.departments-container').html(`
            <div class="alert alert-info text-center">
                <i class="fa fa-spinner fa-spin"></i> در حال بارگذاری بخش‌ها...
            </div>
        `);
    }
    
    /**
     * نمایش خطا برای summary
     */
    show_summary_error() {
        this.parent.page.main.find('.production-summary-indicators').html(`
            <div class="alert alert-danger text-center">
                <i class="fa fa-exclamation-triangle"></i> خطا در بارگذاری آمار
                <button class="btn btn-sm btn-outline-danger ml-2" onclick="location.reload()">
                    تلاش مجدد
                </button>
            </div>
        `);
    }
    
    /**
     * نمایش خطا برای departments
     */
    show_departments_error() {
        this.parent.page.main.find('.departments-container').html(`
            <div class="alert alert-danger text-center">
                <i class="fa fa-exclamation-triangle"></i> خطا در بارگذاری بخش‌ها
                <button class="btn btn-sm btn-outline-danger ml-2" onclick="location.reload()">
                    تلاش مجدد
                </button>
            </div>
        `);
    }



     /* بارگذاری جزئیات ایستگاه‌ها
     */
    load_workstation_details(deptName, index) {
        console.log('Loading workstation details for:', deptName);
        const contentDiv = this.parent.page.main.find(`#dept-content-${index}`);
        
        frappe.call({
            method: 'erpnext.manufacturing.page.orders.orders.get_workstation_details',
            args: { department_name: deptName },
            callback: (r) => {
                console.log('Workstation details received:', r.message);
                if (r.message && r.message.workstations) {
                    this.render_workstations_in_dept(r.message.workstations, index);
                } else {
                    contentDiv.html(`
                        <div class="alert alert-warning text-center">
                            <i class="fa fa-info-circle"></i> هیچ ایستگاه کاری یافت نشد
                        </div>
                    `);
                }
            },
            error: (err) => {
                console.error('Error loading workstation details:', err);
                contentDiv.html(`
                    <div class="alert alert-danger text-center">
                        <i class="fa fa-exclamation-triangle"></i> خطا در بارگذاری ایستگاه‌ها
                    </div>
                `);
            }
        });
    }

    /**
     * رندر ایستگاه‌های یک بخش
     */
    render_workstations_in_dept(workstations, deptIndex) {
        console.log('Rendering workstations for dept index:', deptIndex, workstations);
        const contentDiv = this.parent.page.main.find(`#dept-content-${deptIndex}`);
        
        if (!workstations || workstations.length === 0) {
            contentDiv.html(`
                <div class="alert alert-warning text-center">
                    <i class="fa fa-info-circle"></i> هیچ ایستگاه کاری فعالی یافت نشد
                </div>
            `);
            return;
        }
        
        let html = '<div class="workstations-grid row">';
        workstations.forEach(ws => {
            const statusClass = ws.stuck_jobs > 0 ? 'ws-critical' : 
                              ws.capacity_percentage > 90 ? 'ws-high-load' : 'ws-normal';
            
            html += `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="workstation-card ${statusClass}">
                        <div class="workstation-header">
                            <h6><i class="fa fa-industry"></i> ${ws.name}</h6>
                            <span class="status-badge badge ${this.get_status_badge_class(ws.capacity_percentage)}">
                                ${ws.capacity_percentage}%
                            </span>
                        </div>
                        <div class="workstation-stats">
                            <div class="row">
                                <div class="col-6">
                                    <div class="stat-item">
                                        <span class="stat-number">${ws.pending_jobs || 0}</span>
                                        <span class="stat-label">انتظار</span>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="stat-item">
                                        <span class="stat-number">${ws.in_progress_jobs || 0}</span>
                                        <span class="stat-label">جاری</span>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="stat-item ${ws.stuck_jobs > 0 ? 'text-danger' : ''}">
                                        <span class="stat-number">${ws.stuck_jobs || 0}</span>
                                        <span class="stat-label">ایست</span>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="stat-item">
                                        <span class="stat-number">${ws.pending_hours ? ws.pending_hours.toFixed(1) : '0.0'}</span>
                                        <span class="stat-label">ساعت</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="workstation-actions mt-2">
                            <button class="btn btn-sm btn-outline-info" 
                                    onclick="frappe.employee_productivity.view_workstation_details('${ws.name}')">
                                <i class="fa fa-eye"></i> جزئیات
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        contentDiv.html(html);
    }
    
    /**
     * فیلتر کردن ایستگاه‌ها
     */
    filter_workstations(filterType) {
        const workstations = this.parent.page.main.find('.workstation-card');
        
        workstations.show(); // ابتدا همه را نشان بده
        
        switch(filterType) {
            case 'high-load':
                workstations.not('.ws-high-load, .ws-overload').hide();
                break;
            case 'delayed':
                workstations.each(function() {
                    const delayBadge = $(this).find('.delay-hours');
                    if (delayBadge.length === 0) {
                        $(this).hide();
                    }
                });
                break;
            case 'stuck':
                workstations.not('.ws-critical').hide();
                break;
            case 'all':
            default:
                // همه را نشان بده
                break;
        }
    }
    
    /**
     * کلاس badge بر اساس درصد
     */
    get_status_badge_class(percentage) {
        if (percentage > 100) return 'badge-danger';
        if (percentage > 90) return 'badge-warning';
        if (percentage > 70) return 'badge-info';
        return 'badge-success';
    }
    
    /**
     * متد کمکی برای مشاهده جزئیات workstation
     */
    view_workstation_details(workstation_name) {
        frappe.set_route('Form', 'Workstation', workstation_name);
    }
}

// اضافه کردن به global scope برای دسترسی از HTML
if (typeof frappe !== 'undefined') {
    frappe.employee_productivity = frappe.employee_productivity || {};
    frappe.employee_productivity.view_workstation_details = function(workstation_name) {
        frappe.set_route('Form', 'Workstation', workstation_name);
    };
}


// کلاس پنل مسابقات (استفاده از کد موجود)
class GamificationPanel {
    constructor(page, data) {
        this.page = page;
        this.data = data;
        this.challengeTimer = null;
    }

    render_gamification_panel() {
        this.render_leaderboard();
        this.render_achievements();
        this.render_challenges();
    }

    render_leaderboard() {
        const container = this.page.main.find('.leaderboard-container');
        const productivity_scores = Object.values(this.data.productivity_scores || {});

        if (productivity_scores.length === 0) {
            container.html('<p class="text-muted text-center">هیچ داده‌ای برای جدول امتیازات در دسترس نیست</p>');
            return;
        }

        const sortedEmployees = productivity_scores.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));

        let html = `
            <div class="leaderboard-card">
                <div class="leaderboard-header">
                    <h6>🏆 قهرمانان امروز</h6>
                    <div class="live-indicator">
                        <span class="pulse-dot"></span>
                        زنده
                    </div>
                </div>
                <div class="champions-list">
        `;

        sortedEmployees.slice(0, 10).forEach((emp, index) => {
            const rank = index + 1;
            const rankIcon = this.getRankIcon(rank);
            const levelInfo = this.calculateLevel(emp.final_score || 0);
            const streak = this.calculateStreak(emp.employee);

            html += `
                <div class="champion-row ${rank <= 3 ? 'podium-position' : ''}">
                    <div class="rank-section">
                        <span class="rank-icon">${rankIcon}</span>
                        <span class="rank-number">#${rank}</span>
                    </div>
                    
                    <div class="player-info">
                        <div class="player-name">
                            <strong>${emp.employee}</strong>
                            <span class="level-badge">سطح ${levelInfo.level}</span>
                        </div>
                        <div class="player-stats">
                            <span class="score">${Math.round(emp.final_score || 0)} امتیاز</span>
                            ${streak > 1 ? `<span class="streak">🔥 ${streak} روز پیاپی</span>` : ''}
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${levelInfo.progress}%"></div>
                        </div>
                    </div>
                    
                    <div class="badges-section">
                        ${(emp.badges || []).map(badge => 
                            `<span class="achievement-badge" title="${badge.name}">
                                ${badge.icon}
                            </span>`
                        ).join('')}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="leaderboard-footer">
                    <button class="btn btn-sm btn-outline-primary view-all-btn">
                        مشاهده همه رتبه‌ها ←
                    </button>
                </div>
            </div>
        `;

        container.html(html);
    }

    render_achievements() {
        const container = this.page.main.find('.achievements-container');
        const achievements = this.calculateAchievements();

        let html = `
            <div class="achievements-card">
                <div class="achievements-header">
                    <h6>🏅 دستاوردهای اخیر</h6>
                    <span class="achievements-count">${achievements.length} دستاورد امروز</span>
                </div>
                <div class="achievements-list">
        `;

        achievements.forEach(achievement => {
            html += `
                <div class="achievement-item ${achievement.rarity}">
                    <div class="achievement-icon">
                        ${achievement.icon}
                    </div>
                    <div class="achievement-details">
                        <div class="achievement-name">${achievement.name}</div>
                        <div class="achievement-description">${achievement.description}</div>
                        <div class="achievement-reward">+${achievement.xp} امتیاز</div>
                    </div>
                    <div class="achievement-time">
                        <small class="text-muted">${achievement.timeAgo}</small>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="achievements-footer">
                    <div class="achievement-stats">
                        <span class="stat-item">
                            <strong>${achievements.filter(a => a.rarity === 'legendary').length}</strong>
                            <small>افسانه‌ای</small>
                        </span>
                        <span class="stat-item">
                            <strong>${achievements.filter(a => a.rarity === 'epic').length}</strong>
                            <small>حماسی</small>
                        </span>
                        <span class="stat-item">
                            <strong>${achievements.filter(a => a.rarity === 'rare').length}</strong>
                            <small>نادر</small>
                        </span>
                    </div>
                </div>
            </div>
        `;

        container.html(html);
    }

    render_challenges() {
        const container = this.page.main.find('.challenges-container');
        const challenges = this.getDailyChallenges();

        let html = `
            <div class="challenges-card">
                <div class="challenges-header">
                    <h6>🎯 چالش‌های روزانه</h6>
                    <div class="challenge-timer">
                        <i class="fa fa-clock"></i>
                        <span id="challenge-countdown">23:45:12</span>
                    </div>
                </div>
                <div class="challenges-list">
        `;

        challenges.forEach((challenge) => {
            const progress = this.calculateChallengeProgress(challenge);

            html += `
                <div class="challenge-item ${challenge.completed ? 'completed' : ''}">
                    <div class="challenge-icon">
                        ${challenge.icon}
                    </div>
                    <div class="challenge-details">
                        <div class="challenge-name">
                            ${challenge.name}
                            ${challenge.completed ? '<span class="completed-check">✓</span>' : ''}
                        </div>
                        <div class="challenge-description">${challenge.description}</div>
                        <div class="challenge-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress.percentage}%"></div>
                            </div>
                            <span class="progress-text">${progress.current}/${progress.target}</span>
                        </div>
                        <div class="challenge-reward">
                            <span class="reward-xp">+${challenge.reward.xp} امتیاز</span>
                            ${challenge.reward.badge ? `<span class="reward-badge">${challenge.reward.badge}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="challenges-footer">
                    <button class="btn btn-sm btn-success refresh-challenges">
                        چالش‌های جدید 🔄
                    </button>
                </div>
            </div>
        `;

        container.html(html);
        this.startChallengeCountdown();
    }

    getRankIcon(rank) {
        const icons = { 1: '👑', 2: '🥈', 3: '🥉', 4: '🏅', 5: '🏅' };
        return icons[rank] || '⭐';
    }

    calculateLevel(score) {
        const level = Math.floor(score / 100) + 1;
        const currentLevelXP = (level - 1) * 100;
        const nextLevelXP = level * 100;
        const progress = ((score - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;

        return { level: level, progress: Math.min(progress, 100) };
    }

    calculateStreak(employee) {
        return Math.floor(Math.random() * 7) + 1; // موقتی
    }

    calculateAchievements() {
        const productivity_scores = Object.values(this.data.productivity_scores || {});
        const achievements = [];

        const achievementTemplates = [
            {
                id: 'speed_demon',
                name: 'شیطان سرعت',
                description: '5 کار را در زمان رکوردی تکمیل کن',
                icon: '⚡',
                rarity: 'epic',
                xp: 500,
                condition: (emp) => (emp.job_cards_count >= 5 && emp.efficiency_score > 120)
            },
            {
                id: 'perfectionist',
                name: 'کمال‌گرا',
                description: 'بدون نقص برای 3 کار متوالی',
                icon: '💎',
                rarity: 'legendary',
                xp: 1000,
                condition: (emp) => emp.quality_score >= 100
            },
            {
                id: 'team_player',
                name: 'بازیکن تیمی',
                description: 'به 3 همکار امروز کمک کن',
                icon: '🤝',
                rarity: 'rare',
                xp: 300,
                condition: (emp) => emp.collaboration_score > 90
            },
            {
                id: 'early_bird',
                name: 'سحرخیز',
                description: 'اولین نفر در تکمیل شیف صبح',
                icon: '🐦',
                rarity: 'common',
                xp: 150,
                condition: (emp) => true // موقت
            },
            {
                id: 'machine_master',
                name: 'استاد ماشین‌ها',
                description: '3 ایستگاه کاری مختلف را تسلط یاب',
                icon: '🔧',
                rarity: 'epic',
                xp: 750,
                condition: (emp) => emp.job_cards_count >= 3
            }
        ];

        productivity_scores.forEach(emp => {
            achievementTemplates.forEach(template => {
                if (template.condition(emp)) {
                    achievements.push({
                        ...template,
                        employee: emp.employee,
                        timeAgo: this.getRandomTimeAgo()
                    });
                }
            });
        });

        return achievements.slice(0, 6);
    }

    getDailyChallenges() {
        return [
            {
                id: 'efficiency_master',
                name: 'استاد بهره‌وری',
                description: 'بهره‌وری 90%+ را برای 4 ساعت حفظ کن',
                icon: '🎯',
                target: 4,
                completed: false,
                reward: { xp: 400, badge: '🏆' }
            },
            {
                id: 'quality_guardian',
                name: 'محافظ کیفیت',
                description: 'بدون نقص در 10 کار بعدی',
                icon: '🛡️',
                target: 10,
                completed: false,
                reward: { xp: 600 }
            },
            {
                id: 'speed_runner',
                name: 'دونده سرعت',
                description: 'کارها را 20% سریع‌تر از استاندارد انجام بده',
                icon: '🏃',
                target: 3,
                completed: true,
                reward: { xp: 350 }
            },
            {
                id: 'multitasker',
                name: 'چندکاره',
                description: 'روی 3+ عملیات مختلف کار کن',
                icon: '🎭',
                target: 3,
                completed: false,
                reward: { xp: 250 }
            }
        ];
    }

    calculateChallengeProgress(challenge) {
        const current = challenge.completed ? challenge.target : Math.floor(Math.random() * challenge.target);
        return {
            current: current,
            target: challenge.target,
            percentage: (current / challenge.target) * 100
        };
    }

    getRandomTimeAgo() {
        const times = ['2 دقیقه پیش', '15 دقیقه پیش', '1 ساعت پیش', '2 ساعت پیش', '3 ساعت پیش'];
        return times[Math.floor(Math.random() * times.length)];
    }

    startChallengeCountdown() {
        const countdownElement = this.page.main.find('#challenge-countdown');
        if (countdownElement.length === 0) return;

        if (this.challengeTimer) {
            clearInterval(this.challengeTimer);
        }

        let hours = 23, minutes = 45, seconds = 12;

        const timer = setInterval(() => {
            seconds--;
            if (seconds < 0) {
                seconds = 59;
                minutes--;
            }
            if (minutes < 0) {
                minutes = 59;
                hours--;
            }
            if (hours < 0) {
                hours = 23;
                minutes = 59;
                seconds = 59;
            }

            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            countdownElement.text(timeString);
        }, 1000);

        this.challengeTimer = timer;
    }
}
frappe.provide('frappe.pages.orders');

// اعمال استایل‌های اساسی
$(document).ready(function() {
    $('head').append(`
        <style>
            /* استایل‌های کلی تب‌ها */
            .nav-tabs .nav-link {
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .nav-tabs .nav-link:hover {
                border-color: #e9ecef #e9ecef #dee2e6;
            }
            .nav-tabs .nav-link.active {
                background-color: #fff;
                border-color: #dee2e6 #dee2e6 #fff;
            }
            .tab-pane {
                display: none;
            }
            .tab-pane.active {
                display: block;
            }
            
            /* استایل‌های کارت‌های اطلاعاتی */
            .info-card {
                border-radius: 10px;
                padding: 20px;
                color: white;
                margin-bottom: 20px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            
            .info-card-body {
                display: flex;
                align-items: center;
            }
            
            .info-icon {
                font-size: 2rem;
                margin-right: 15px;
            }
            
            .info-content h3 {
                margin: 0;
                font-size: 2rem;
                font-weight: bold;
            }
            
            .info-content p {
                margin: 5px 0 0 0;
                opacity: 0.9;
            }
            
            /* استایل‌های مخصوص نظارت لحظه‌ای */
            .live-indicator {
                display: inline-flex;
                align-items: center;
                color: #28a745;
                font-weight: bold;
            }
            
            .pulse-dot {
                width: 8px;
                height: 8px;
                background-color: #28a745;
                border-radius: 50%;
                margin-right: 5px;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.2); opacity: 0.7; }
                100% { transform: scale(1); opacity: 1; }
            }
            
            .status-card {
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                color: white;
            }
            
            .status-card.working { background: linear-gradient(135deg, #28a745, #20c997); }
            .status-card.idle { background: linear-gradient(135deg, #ffc107, #fd7e14); }
            .status-card.break { background: linear-gradient(135deg, #17a2b8, #6f42c1); }
            .status-card.offline { background: linear-gradient(135deg, #6c757d, #495057); }
            
            /* استایل‌های employee grid */
            .employee-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 15px;
                padding: 10px 0;
            }
            
            .employee-card {
                background: white;
                border-radius: 10px;
                padding: 15px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                border-left: 4px solid;
                transition: all 0.3s ease;
            }
            
            .employee-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            
            .employee-card.status-working { border-left-color: #28a745; }
            .employee-card.status-idle { border-left-color: #ffc107; }
            .employee-card.status-break { border-left-color: #17a2b8; }
            .employee-card.status-offline { border-left-color: #6c757d; }
            
            /* Progress bars */
            .progress-cell .progress {
                height: 20px;
                margin-bottom: 5px;
            }
            
            /* Responsive design */
            @media (max-width: 768px) {
                .employee-grid {
                    grid-template-columns: 1fr;
                }
                
                .info-card-body {
                    text-align: center;
                    flex-direction: column;
                }
                
                .info-icon {
                    margin-right: 0;
                    margin-bottom: 10px;
                }
            }
        </style>
    `);
});