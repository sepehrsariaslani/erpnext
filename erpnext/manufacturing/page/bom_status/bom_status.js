frappe.pages['bom-status'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'وضعیت BOM - مصرف مواد',
        single_column: true
    });

    // اضافه کردن CSS برای استایل بهتر
    $(`
    <style>
        .bom-status-container {
            padding: 15px;
        }
        .bom-search-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .bom-table {
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .bom-table table {
            margin-bottom: 0;
        }
        .bom-header-row {
            background: #007bff;
            color: white;
            font-weight: bold;
        }
        .bom-level-1 { background: #f8f9fa; }
        .bom-level-2 { background: #fff3cd; }
        .bom-level-3 { background: #d4edda; }
        .bom-level-4 { background: #cce7ff; }
        .bom-level-5 { background: #f0e6ff; }
        
        .expandable-row {
            cursor: pointer;
        }
        .expandable-row:hover {
            background: #e9ecef !important;
        }
        .expand-icon {
            margin-right: 5px;
            transition: transform 0.3s;
        }
        .expand-icon.expanded {
            transform: rotate(90deg);
        }
        .item-indent {
            padding-right: 20px;
        }
        .collapsed-row {
            display: none;
        }
        .search-controls {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: center;
        }
        .control-group {
            flex: 1;
            min-width: 200px;
        }
        .btn-group {
            gap: 10px;
        }
    </style>
    `).appendTo('head');

    let container = $('<div class="bom-status-container">').appendTo(page.body);
    let currentData = [];
    let expandedRows = new Set();

    // ساخت بخش جستجو و کنترل‌ها
    let searchSection = $(`
        <div class="bom-search-section">
            <div class="search-controls">
                <div class="control-group">
                    <label>انتخاب BOM:</label>
                    <select class="form-control" id="bom-selector">
                        <option value="">همه BOM ها</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>جستجو:</label>
                    <input type="text" class="form-control" id="search-input" placeholder="جستجو در BOM ها و آیتم‌ها...">
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" id="search-btn">جستجو</button>
                    <button class="btn btn-secondary" id="clear-btn">پاک کردن</button>
                    <button class="btn btn-success" id="expand-all-btn">باز کردن همه</button>
                    <button class="btn btn-warning" id="collapse-all-btn">بستن همه</button>
                </div>
            </div>
        </div>
    `).appendTo(container);

    let tableContainer = $('<div class="bom-table">').appendTo(container);

    // بارگذاری لیست BOM ها
    loadBOMList();

    // Event handlers
    $('#bom-selector').change(function() {
        let selectedBOM = $(this).val();
        if (selectedBOM) {
            loadBOMData('', selectedBOM);
        } else {
            loadBOMData();
        }
    });

    $('#search-btn').click(function() {
        let searchText = $('#search-input').val();
        let selectedBOM = $('#bom-selector').val();
        loadBOMData(searchText, selectedBOM);
    });

    $('#search-input').keypress(function(e) {
        if (e.which === 13) { // Enter key
            $('#search-btn').click();
        }
    });

    $('#clear-btn').click(function() {
        $('#search-input').val('');
        $('#bom-selector').val('');
        expandedRows.clear();
        loadBOMData();
    });

    $('#expand-all-btn').click(function() {
        expandAllRows();
    });

    $('#collapse-all-btn').click(function() {
        collapseAllRows();
    });

    function loadBOMList() {
        frappe.call({
            method: 'erpnext.manufacturing.page.bom_status.bom_status.get_all_boms_simple',
            callback: function(r) {
                if (r.message) {
                    let selector = $('#bom-selector');
                    selector.empty().append('<option value="">همه BOM ها</option>');
                    
                    r.message.forEach(bom => {
                        selector.append(`<option value="${bom.name}">${bom.name} - ${bom.item_name || bom.item_code}</option>`);
                    });
                }
            }
        });
    }

    function loadBOMData(searchText = '', selectedBOM = '') {
        frappe.call({
            method: 'erpnext.manufacturing.page.bom_status.bom_status.get_bom_status_simple',
            args: {
                search_text: searchText,
                selected_bom: selectedBOM
            },
            callback: function(r) {
                if (r.message) {
                    currentData = r.message;
                    renderBOMTable(r.message);
                }
            }
        });
    }

    function renderBOMTable(data) {
        if (!data || data.length === 0) {
            tableContainer.html('<div class="alert alert-info">هیچ داده‌ای یافت نشد</div>');
            return;
        }

        // اگر فقط لیست BOM ها برگردونده شده
        if (data[0] && data[0].type === 'bom_list') {
            renderBOMList(data[0].bom_list);
            return;
        }

        let html = `
        <table class="table table-bordered table-hover">
            <thead class="bom-header-row">
                <tr>
                    <th style="width: 30px;"></th>
                    <th>کد محصول</th>
                    <th>نام محصول</th>
                    <th>مقدار مصرفی</th>
                    <th>واحد</th>
                    <th>نرخ واحد</th>
                    <th>کل مبلغ</th>
                    <th>عملیات</th>
                </tr>
            </thead>
            <tbody>
        `;

        let currentBOM = '';
        
        data.forEach((item, index) => {
            if (item.type === 'bom_header') {
                html += renderBOMHeader(item);
                currentBOM = item.bom_name;
            } else if (item.type === 'bom_item') {
                html += renderBOMItem(item, index, currentBOM);
            }
        });

        html += '</tbody></table>';
        tableContainer.html(html);

        // اضافه کردن event handlers برای expand/collapse
        attachTableEvents();
    }

    function renderBOMList(bomList) {
        if (!bomList || bomList.length === 0) {
            tableContainer.html('<div class="alert alert-info">هیچ BOM فعالی یافت نشد</div>');
            return;
        }

        let html = `
        <table class="table table-bordered table-hover">
            <thead class="bom-header-row">
                <tr>
                    <th>کد BOM</th>
                    <th>کد محصول</th>
                    <th>نام محصول</th>
                    <th>عملیات</th>
                </tr>
            </thead>
            <tbody>
        `;

        bomList.forEach(bom => {
            html += `
            <tr>
                <td><strong>${bom.name}</strong></td>
                <td>${bom.item_code}</td>
                <td>${bom.item_name || bom.item_code}</td>
                <td>
                    <button class="btn btn-sm btn-primary view-bom-btn" data-bom="${bom.name}">
                        مشاهده جزئیات
                    </button>
                </td>
            </tr>
            `;
        });

        html += '</tbody></table>';
        tableContainer.html(html);

        // اضافه کردن event handler برای دکمه‌های مشاهده
        $('.view-bom-btn').click(function() {
            let bomName = $(this).data('bom');
            $('#bom-selector').val(bomName);
            loadBOMData('', bomName);
        });
    }

    function renderBOMHeader(item) {
        return `
        <tr class="bom-header-row">
            <td colspan="8">
                <strong>BOM: ${item.bom_name}</strong> | 
                محصول: ${item.bom_item} - ${item.bom_item_name || ''} | 
                کل هزینه: ${formatNumber(item.total_cost)} | 
                مقدار: ${item.quantity} ${item.uom}
            </td>
        </tr>
        `;
    }

    function renderBOMItem(item, index, currentBOM) {
        let indent = '&nbsp;&nbsp;'.repeat((item.level - 1) * 2);
        let levelClass = `bom-level-${Math.min(item.level, 5)}`;
        let rowId = `row-${currentBOM}-${index}`;
        let hasSubBOM = item.has_sub_bom == 1;
        let isExpanded = expandedRows.has(rowId);
        
        let expandIcon = '';
        let rowClass = levelClass;
        
        if (hasSubBOM) {
            expandIcon = `<i class="fa fa-chevron-right expand-icon ${isExpanded ? 'expanded' : ''}" data-row="${rowId}"></i>`;
            rowClass += ' expandable-row';
        }

        return `
        <tr class="${rowClass}" id="${rowId}" data-level="${item.level}" data-parent="${item.bom_name}">
            <td>${expandIcon}</td>
            <td class="item-indent">${indent}${item.item_code}</td>
            <td>${item.item_name || item.item_code}</td>
            <td class="text-center">${formatNumber(item.total_required_qty)}</td>
            <td class="text-center">${item.uom}</td>
            <td class="text-left">${formatNumber(item.rate)}</td>
            <td class="text-left">${formatNumber(item.total_amount)}</td>
            <td class="text-center">
                ${hasSubBOM ? `<button class="btn btn-xs btn-info expand-sub-bom" data-item="${item.item_code}">نمایش زیرمجموعه</button>` : '-'}
            </td>
        </tr>
        `;
    }

    function attachTableEvents() {
        // Event handler برای expand/collapse
        $('.expand-icon').click(function(e) {
            e.stopPropagation();
            let rowId = $(this).data('row');
            toggleRowExpansion(rowId);
        });

        $('.expandable-row').click(function() {
            let rowId = $(this).attr('id');
            toggleRowExpansion(rowId);
        });

        // Event handler برای نمایش زیرمجموعه
        $('.expand-sub-bom').click(function(e) {
            e.stopPropagation();
            let itemCode = $(this).data('item');
            // اینجا می‌تونید logic برای باز کردن BOM زیرمجموعه اضافه کنید
            frappe.msgprint(`نمایش زیرمجموعه برای ${itemCode} - این قابلیت در حال توسعه است`);
        });
    }

    function toggleRowExpansion(rowId) {
        if (expandedRows.has(rowId)) {
            expandedRows.delete(rowId);
            $(`#${rowId} .expand-icon`).removeClass('expanded');
        } else {
            expandedRows.add(rowId);
            $(`#${rowId} .expand-icon`).addClass('expanded');
        }
        
        // اینجا logic برای نمایش/مخفی کردن ردیف‌های فرزند
        // در صورت نیاز می‌تونید پیاده‌سازی کنید
    }

    function expandAllRows() {
        $('.expand-icon').each(function() {
            let rowId = $(this).data('row');
            expandedRows.add(rowId);
            $(this).addClass('expanded');
        });
    }

    function collapseAllRows() {
        expandedRows.clear();
        $('.expand-icon').removeClass('expanded');
    }

    function formatNumber(num) {
        if (!num || isNaN(num)) return '0';
        return parseFloat(num).toLocaleString('fa-IR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // بارگذاری اولیه داده‌ها
    loadBOMData();
}