// employee_productivity.js
frappe.pages['employee-productivity'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Employee Productivity Dashboard'),
        single_column: true
    });
    
    frappe.employee_productivity = new EmployeeProductivity(page);
};

class EmployeeProductivity {
    constructor(page) {
        this.page = page;
        this.setup_filters();
        this.setup_layout();
        this.load_data();
    }
    
    setup_filters() {
        // اضافه کردن فیلترها به صفحه
        this.page.add_field({
            fieldname: 'from_date',
            label: __('From Date'),
            fieldtype: 'Date',
            default: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
            change: () => this.load_data()
        });
        
        this.page.add_field({
            fieldname: 'to_date',
            label: __('To Date'),
            fieldtype: 'Date',
            default: frappe.datetime.get_today(),
            change: () => this.load_data()
        });
        
        this.page.add_field({
            fieldname: 'employee',
            label: __('Employee'),
            fieldtype: 'Link',
            options: 'Employee',
            change: () => this.load_data()
        });
        
        this.page.add_field({
            fieldname: 'workstation',
            label: __('Workstation'),
            fieldtype: 'Link',
            options: 'Workstation',
            change: () => this.load_data()
        });
        
        // دکمه رفرش
        this.page.add_menu_item(__('Refresh'), () => {
            this.load_data();
        }, true);
    }
    
    setup_layout() {
        // ایجاد ساختار صفحه
        this.page.main.html(`
            <div class="employee-productivity-dashboard">
                <div class="row">
                    <div class="col-md-12">
                        <div class="productivity-summary-cards"></div>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5>${__('Top Performers')}</h5>
                            </div>
                            <div class="card-body top-performers-chart"></div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5>${__('Efficiency Trends')}</h5>
                            </div>
                            <div class="card-body efficiency-chart"></div>
                        </div>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-12">
                        <div class="card">
                            <div class="card-header">
                                <h5>${__('Employee Work Paths')}</h5>
                            </div>
                            <div class="card-body work-paths-container"></div>
                        </div>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-md-12">
                        <div class="card">
                            <div class="card-header">
                                <h5>${__('Detailed Productivity Report')}</h5>
                            </div>
                            <div class="card-body productivity-table-container"></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }
    
    get_filters() {
        return {
            from_date: this.page.fields_dict.from_date.get_value(),
            to_date: this.page.fields_dict.to_date.get_value(),
            employee: this.page.fields_dict.employee.get_value(),
            workstation: this.page.fields_dict.workstation.get_value()
        };
    }
    
    load_data() {
        const filters = this.get_filters();
        
        frappe.call({
            method: 'erpnext.manufacturing.page.employee_productivity.employee_productivity.get_employee_productivity_data',
            args: {
                filters: filters
            },
            callback: (r) => {
                if (r.message) {
                    this.data = r.message;
                    this.render_dashboard();
                }
            }
        });
    }
    
    render_dashboard() {
        this.render_summary_cards();
        this.render_top_performers_chart();
        this.render_efficiency_chart();
        this.render_work_paths();
        this.render_productivity_table();
    }
    
    render_summary_cards() {
        const summary = this.data.summary;
        const container = this.page.main.find('.productivity-summary-cards');
        
        container.html(`
            <div class="row">
                <div class="col-md-3">
                    <div class="card bg-primary text-white">
                        <div class="card-body">
                            <h4>${summary.total_employees || 0}</h4>
                            <p class="mb-0">${__('Total Employees')}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-success text-white">
                        <div class="card-body">
                            <h4>${flt(summary.average_efficiency, 1)}%</h4>
                            <p class="mb-0">${__('Average Efficiency')}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-info text-white">
                        <div class="card-body">
                            <h4>${summary.top_performer ? summary.top_performer.employee : '-'}</h4>
                            <p class="mb-0">${__('Top Performer')}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-warning text-white">
                        <div class="card-body">
                            <h4>${this.data.job_cards.length || 0}</h4>
                            <p class="mb-0">${__('Total Job Cards')}</p>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }
    
    render_top_performers_chart() {
        const container = this.page.main.find('.top-performers-chart');
        const rankings = this.data.summary.rankings || [];
        
        if (rankings.length === 0) {
            container.html('<p class="text-muted">No data available</p>');
            return;
        }
        
        // تهیه داده برای نمودار
        const labels = rankings.slice(0, 10).map(emp => emp.employee);
        const scores = rankings.slice(0, 10).map(emp => emp.final_score || 0);
        
        const chartContainer = $('<canvas></canvas>');
        container.html(chartContainer);
        
        new frappe.Chart(chartContainer[0], {
            title: __('Top 10 Performers'),
            data: {
                labels: labels,
                datasets: [{
                    name: 'Final Score',
                    values: scores
                }]
            },
            type: 'bar',
            height: 300,
            colors: ['#28a745']
        });
    }
    
    render_efficiency_chart() {
        const container = this.page.main.find('.efficiency-chart');
        const productivity_scores = Object.values(this.data.productivity_scores);
        
        if (productivity_scores.length === 0) {
            container.html('<p class="text-muted">No data available</p>');
            return;
        }
        
        const labels = productivity_scores.map(emp => emp.employee);
        const efficiency = productivity_scores.map(emp => emp.efficiency_score || 0);
        
        const chartContainer = $('<canvas></canvas>');
        container.html(chartContainer);
        
        new frappe.Chart(chartContainer[0], {
            title: __('Efficiency Comparison'),
            data: {
                labels: labels,
                datasets: [{
                    name: 'Efficiency %',
                    values: efficiency
                }]
            },
            type: 'line',
            height: 300,
            colors: ['#007bff']
        });
    }
    
    render_work_paths() {
        const container = this.page.main.find('.work-paths-container');
        const employee_paths = this.data.employee_paths;
        
        if (Object.keys(employee_paths).length === 0) {
            container.html('<p class="text-muted">No work path data available</p>');
            return;
        }
        
        let html = '<div class="work-paths">';
        
        Object.keys(employee_paths).forEach(employee => {
            const paths = employee_paths[employee];
            html += `
                <div class="employee-path mb-4">
                    <h6 class="mb-3">${employee}</h6>
                    <div class="path-timeline">
            `;
            
            paths.forEach((path, index) => {
                html += `
                    <div class="path-item">
                        <div class="path-card">
                            <div class="card-header">
                                <small class="text-muted">${frappe.datetime.str_to_user(path.from_time)}</small>
                            </div>
                            <div class="card-body">
                                <strong>${path.job_card}</strong><br>
                                <small>${path.operation} @ ${path.workstation}</small><br>
                                <small class="text-info">${path.duration_mins} mins</small>
                            </div>
                        </div>
                        ${index < paths.length - 1 ? '<div class="path-arrow">→</div>' : ''}
                    </div>
                `;
            });
            
            html += '</div></div>';
        });
        
        html += '</div>';
        
        container.html(html);
        
        // اضافه کردن CSS برای timeline
        if (!$('#work-paths-css').length) {
            $('<style id="work-paths-css">').html(`
                .path-timeline {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .path-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .path-card {
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    min-width: 150px;
                    background: #f8f9fa;
                }
                .path-card .card-header {
                    padding: 5px 10px;
                    background: #e9ecef;
                    border-bottom: 1px solid #ddd;
                    border-radius: 7px 7px 0 0;
                }
                .path-card .card-body {
                    padding: 10px;
                }
                .path-arrow {
                    font-size: 20px;
                    color: #007bff;
                    font-weight: bold;
                }
            `).appendTo('head');
        }
    }
    
    render_productivity_table() {
        const container = this.page.main.find('.productivity-table-container');
        const productivity_scores = Object.values(this.data.productivity_scores);
        
        if (productivity_scores.length === 0) {
            container.html('<p class="text-muted">No productivity data available</p>');
            return;
        }
        
        let html = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>${__('Rank')}</th>
                            <th>${__('Employee')}</th>
                            <th>${__('Final Score')}</th>
                            <th>${__('Efficiency %')}</th>
                            <th>${__('Quality %')}</th>
                            <th>${__('Job Cards')}</th>
                            <th>${__('Total Output')}</th>
                            <th>${__('Badges')}</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // مرتب‌سازی بر اساس امتیاز نهایی
        const sortedEmployees = productivity_scores.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
        
        sortedEmployees.forEach((emp, index) => {
            const badges = emp.badges.map(badge => 
                `<span class="badge badge-${badge.color || 'secondary'}" title="${badge.name}">
                    ${badge.icon} ${badge.name}
                </span>`
            ).join(' ');
            
            html += `
                <tr>
                    <td>
                        ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </td>
                    <td><strong>${emp.employee}</strong></td>
                    <td><span class="badge badge-primary">${flt(emp.final_score, 2)}</span></td>
                    <td>${flt(emp.efficiency_score, 1)}%</td>
                    <td>${flt(emp.quality_score, 1)}%</td>
                    <td>${emp.job_cards_count}</td>
                    <td>${flt(emp.total_output, 0)}</td>
                    <td>${badges}</td>
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