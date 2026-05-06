/**
 * PremiumDatePicker — Antigravity Design System
 * Zero-dependency, iOS/macOS inspired date picker component.
 * V2: Match Reference Image 2 (Premium visuals & Range preview)
 *
 * Usage:
 *   PremiumDatePicker.attach('#my-input', { mode: 'single' });
 *   PremiumDatePicker.attach('#range-trigger', {
 *       mode: 'range',
 *       onSelect: (start, end) => { ... },
 *       onClear: () => { ... }
 *   });
 */
const PremiumDatePicker = (() => {
    // ---- Constants ----
    const MONTHS = [
        'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
        'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'
    ];
    const WEEKDAYS = ['T2','T3','T4','T5','T6','T7','CN'];
    const instances = new Map();

    // ---- Helpers ----
    function daysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function startDayOfMonth(year, month) {
        let day = new Date(year, month, 1).getDay();
        return day === 0 ? 6 : day - 1; // Monday-indexed
    }

    function isSameDay(a, b) {
        if (!a || !b) return false;
        return a.getFullYear() === b.getFullYear() &&
               a.getMonth() === b.getMonth() &&
               a.getDate() === b.getDate();
    }

    function isToday(d) {
        return isSameDay(d, new Date());
    }

    function isBetween(d, start, end) {
        if (!start || !end) return false;
        const t = d.getTime();
        return t > start.getTime() && t < end.getTime();
    }

    function formatDate(d, fmt) {
        if (!d) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        if (fmt === 'Y-m-d') return `${yyyy}-${mm}-${dd}`;
        return `${dd}/${mm}/${yyyy}`;
    }

    function parseDate(str) {
        if (!str) return null;
        if (str.includes('-')) {
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
        }
        const parts = str.split('/');
        if (parts.length === 3) {
            const d = new Date(parts[2], parts[1] - 1, parts[0]);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    // ---- Core Class ----
    class DatePickerInstance {
        constructor(triggerEl, opts) {
            this.trigger = typeof triggerEl === 'string'
                ? document.querySelector(triggerEl)
                : triggerEl;

            if (!this.trigger) return;

            this.opts = Object.assign({
                mode: 'single',
                dateFormat: 'Y-m-d',
                displayFormat: 'd/m/Y',
                label: 'CH\u1eccN NG\u00c0Y',
                showFooter: false,
                minYear: 2015,
                maxYear: 2035,
                appendTo: null,
                placement: 'auto', // 'auto', 'bottom', 'right', 'left', 'top'
                onSelect: null,
                onClear: null,
                onChange: null,
            }, opts);

            if (this.opts.mode === 'range') {
                this.opts.showFooter = true;
                if (this.opts.label === 'CHỌN NGÀY') this.opts.label = 'THỜI GIAN LỌC';
            }

            // State
            this.isOpen = false;
            this.viewYear = new Date().getFullYear();
            this.viewMonth = new Date().getMonth();
            this.selectedDate = null;
            this.rangeStart = null;
            this.rangeEnd = null;
            this.hoverDate = null;

            // DOM
            this.containerEl = null;
            this.backdropEl = null;
            this.monthDropdownOpen = false;
            this.yearDropdownOpen = false;

            // Read initial values from trigger or data attributes
            this._readInitialValue();

            this._build();
            this._bindTrigger();
        }

        _readInitialValue() {
            if (this.trigger.value) {
                const parsed = parseDate(this.trigger.value);
                if (parsed) {
                    this.selectedDate = parsed;
                    this.viewYear = parsed.getFullYear();
                    this.viewMonth = parsed.getMonth();
                }
            }
        }

        // ---- Build DOM ----
        _build() {
            this.containerEl = document.createElement('div');
            this.containerEl.className = 'pdp-container';
            this.containerEl.setAttribute('data-pdp', 'true');

            // 1. Label
            const label = document.createElement('div');
            label.className = 'pdp-label';
            label.innerHTML = `<span>${this.opts.label}</span><i class="fas fa-calendar-alt" style="opacity:0.2"></i>`;
            this.containerEl.appendChild(label);

            // 2. Range Preview (New from Image 2)
            if (this.opts.mode === 'range') {
                const rangePreview = document.createElement('div');
                rangePreview.className = 'pdp-range-preview';
                
                this._labelStart = document.createElement('div');
                this._labelStart.className = 'pdp-range-label pdp-active';
                this._labelStart.textContent = 'Từ ngày';

                const sep = document.createElement('div');
                sep.className = 'pdp-range-sep';
                sep.innerHTML = '<i class="fas fa-arrow-right"></i>';

                this._labelEnd = document.createElement('div');
                this._labelEnd.className = 'pdp-range-label';
                this._labelEnd.textContent = 'Đến ngày';

                rangePreview.appendChild(this._labelStart);
                rangePreview.appendChild(sep);
                rangePreview.appendChild(this._labelEnd);
                this.containerEl.appendChild(rangePreview);
            }

            // 3. Header (Navigation + Selectors)
            const header = document.createElement('div');
            header.className = 'pdp-header';

            this._prevBtn = this._createNavBtn('fas fa-chevron-left', () => this._navigate(-1));
            this._nextBtn = this._createNavBtn('fas fa-chevron-right', () => this._navigate(1));

            // Unified Selectors Pill
            this._selectors = document.createElement('div');
            this._selectors.className = 'pdp-selectors';

            this._monthWrap = this._createSelectDropdown('month');
            this._yearWrap = this._createSelectDropdown('year');

            this._selectors.appendChild(this._monthWrap);
            this._selectors.appendChild(this._yearWrap);

            header.appendChild(this._prevBtn);
            header.appendChild(this._selectors);
            header.appendChild(this._nextBtn);
            this.containerEl.appendChild(header);

            // 4. Weekdays
            const weekdays = document.createElement('div');
            weekdays.className = 'pdp-weekdays';
            WEEKDAYS.forEach(d => {
                const el = document.createElement('div');
                el.className = 'pdp-weekday';
                el.textContent = d;
                weekdays.appendChild(el);
            });
            this.containerEl.appendChild(weekdays);

            // 5. Days grid
            this._daysGrid = document.createElement('div');
            this._daysGrid.className = 'pdp-days';
            this.containerEl.appendChild(this._daysGrid);

            // 6. Footer (Apply/Cancel)
            if (this.opts.showFooter) {
                const footer = document.createElement('div');
                footer.className = 'pdp-footer';

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'pdp-footer-btn pdp-cancel';
                cancelBtn.textContent = 'Hủy';
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.clear();
                    this.close();
                });

                const applyBtn = document.createElement('button');
                applyBtn.className = 'pdp-footer-btn pdp-apply';
                applyBtn.textContent = 'Áp dụng';
                applyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.close();
                });

                footer.appendChild(cancelBtn);
                footer.appendChild(applyBtn);
                this.containerEl.appendChild(footer);
            }

            // Append to DOM
            const parent = this.opts.appendTo || document.body;
            parent.appendChild(this.containerEl);

            // Prevent container clicks from propagating
            this.containerEl.addEventListener('click', (e) => e.stopPropagation());
        }

        _createNavBtn(iconClass, onClick) {
            const btn = document.createElement('button');
            btn.className = 'pdp-nav-btn';
            btn.type = 'button';
            btn.innerHTML = `<i class="${iconClass}"></i>`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
            return btn;
        }

        _createSelectDropdown(type) {
            const wrap = document.createElement('div');
            wrap.className = 'pdp-select-wrap';

            const btn = document.createElement('button');
            btn.className = 'pdp-select-btn';
            btn.type = 'button';

            const textSpan = document.createElement('span');
            const chevron = document.createElement('i');
            chevron.className = 'fas fa-chevron-down pdp-chevron';

            btn.appendChild(textSpan);
            btn.appendChild(chevron);
            wrap.appendChild(btn);

            const dropdown = document.createElement('div');
            dropdown.className = 'pdp-dropdown';
            wrap.appendChild(dropdown);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (type === 'month') this._toggleMonthDropdown();
                else this._toggleYearDropdown();
            });

            if (type === 'month') {
                this._monthBtn = btn;
                this._monthText = textSpan;
                this._monthDropdown = dropdown;
            } else {
                this._yearBtn = btn;
                this._yearText = textSpan;
                this._yearDropdown = dropdown;
            }

            return wrap;
        }

        // ---- Navigation ----
        _navigate(dir) {
            this.viewMonth += dir;
            if (this.viewMonth < 0) {
                this.viewMonth = 11;
                this.viewYear--;
            } else if (this.viewMonth > 11) {
                this.viewMonth = 0;
                this.viewYear++;
            }
            this._render();
        }

        // ---- Dropdowns ----
        _toggleMonthDropdown() {
            this._closeYearDropdown();
            this.monthDropdownOpen = !this.monthDropdownOpen;
            if (this.monthDropdownOpen) {
                this._monthDropdown.innerHTML = '';
                MONTHS.forEach((m, i) => {
                    const item = document.createElement('div');
                    item.className = 'pdp-dropdown-item' + (i === this.viewMonth ? ' pdp-active' : '');
                    item.textContent = m;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.viewMonth = i;
                        this._closeMonthDropdown();
                        this._render();
                    });
                    this._monthDropdown.appendChild(item);
                });
                this._monthDropdown.classList.add('pdp-dropdown-visible');
            } else {
                this._closeMonthDropdown();
            }
        }

        _closeMonthDropdown() {
            this.monthDropdownOpen = false;
            this._monthDropdown.classList.remove('pdp-dropdown-visible');
        }

        _toggleYearDropdown() {
            this._closeMonthDropdown();
            this.yearDropdownOpen = !this.yearDropdownOpen;
            if (this.yearDropdownOpen) {
                this._yearDropdown.innerHTML = '';
                for (let y = this.opts.minYear; y <= this.opts.maxYear; y++) {
                    const item = document.createElement('div');
                    item.className = 'pdp-dropdown-item' + (y === this.viewYear ? ' pdp-active' : '');
                    item.textContent = y;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.viewYear = y;
                        this._closeYearDropdown();
                        this._render();
                    });
                    this._yearDropdown.appendChild(item);
                }
                this._yearDropdown.classList.add('pdp-dropdown-visible');
            } else {
                this._closeYearDropdown();
            }
        }

        _closeYearDropdown() {
            this.yearDropdownOpen = false;
            this._yearDropdown.classList.remove('pdp-dropdown-visible');
        }

        // ---- Render ----
        _render() {
            this._monthText.textContent = MONTHS[this.viewMonth].replace('Tháng ', '');
            this._yearText.textContent = this.viewYear;

            // Update Range Labels
            if (this.opts.mode === 'range') {
                if (this.rangeStart) {
                    this._labelStart.textContent = formatDate(this.rangeStart, 'd/m/Y');
                    this._labelStart.classList.add('pdp-active');
                    this._labelEnd.classList.add('pdp-active');
                } else {
                    this._labelStart.textContent = 'Từ ngày';
                    this._labelStart.classList.add('pdp-active');
                    this._labelEnd.classList.remove('pdp-active');
                }
                
                if (this.rangeEnd) {
                    this._labelEnd.textContent = formatDate(this.rangeEnd, 'd/m/Y');
                    this._labelEnd.classList.remove('pdp-preview-active');
                } else {
                    this._labelEnd.textContent = 'Đến ngày';
                    this._labelEnd.classList.remove('pdp-preview-active');
                }
            }

            this._daysGrid.innerHTML = '';
            const total = daysInMonth(this.viewYear, this.viewMonth);
            const startDay = startDayOfMonth(this.viewYear, this.viewMonth);

            // Previous Month
            const prevMonth = this.viewMonth === 0 ? 11 : this.viewMonth - 1;
            const prevYear = this.viewMonth === 0 ? this.viewYear - 1 : this.viewYear;
            const prevTotal = daysInMonth(prevYear, prevMonth);
            for (let i = startDay - 1; i >= 0; i--) {
                const d = prevTotal - i;
                this._daysGrid.appendChild(this._createDayCell(d, true, new Date(prevYear, prevMonth, d)));
            }

            // Current Month
            for (let d = 1; d <= total; d++) {
                this._daysGrid.appendChild(this._createDayCell(d, false, new Date(this.viewYear, this.viewMonth, d)));
            }

            // Next Month
            const filled = startDay + total;
            const nextCount = (Math.ceil(filled / 7) * 7) - filled;
            const nextMonth = this.viewMonth === 11 ? 0 : this.viewMonth + 1;
            const nextYear = this.viewMonth === 11 ? this.viewYear + 1 : this.viewYear;
            for (let d = 1; d <= nextCount; d++) {
                this._daysGrid.appendChild(this._createDayCell(d, true, new Date(nextYear, nextMonth, d)));
            }
        }

        _createDayCell(num, isOutside, date) {
            const cell = document.createElement('div');
            cell.className = 'pdp-day';
            cell.textContent = num;
            cell._date = date; // Store date for efficient hover updates

            if (isOutside) cell.classList.add('pdp-outside');
            if (isToday(date)) cell.classList.add('pdp-today');

            if (this.opts.mode === 'single' && isSameDay(date, this.selectedDate)) {
                cell.classList.add('pdp-selected');
            }

            if (this.opts.mode === 'range') {
                const start = this.rangeStart;
                const end = this.rangeEnd || this.hoverDate;
                
                if (isSameDay(date, this.rangeStart)) cell.classList.add('pdp-range-start');
                if (isSameDay(date, this.rangeEnd)) cell.classList.add('pdp-range-end');
                
                if (start && end) {
                    const [s, e] = start < end ? [start, end] : [end, start];
                    if (isBetween(date, s, e)) cell.classList.add('pdp-in-range');
                    
                    // Hover states
                    if (!this.rangeEnd && this.hoverDate && isSameDay(date, this.hoverDate)) {
                        cell.classList.add(date < start ? 'pdp-range-start' : 'pdp-range-end');
                    }
                }
            }

            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this._onDayClick(date);
            });

            if (this.opts.mode === 'range') {
                cell.addEventListener('mouseenter', () => {
                    if (this.rangeStart && !this.rangeEnd) {
                        this.hoverDate = date;
                        this._updateRangeHighlights();
                    }
                });
            }

            return cell;
        }

        _updateRangeHighlights() {
            if (!this.rangeStart || !this.hoverDate) return;
            
            const start = this.rangeStart;
            const end = this.hoverDate;
            const [s, e] = start < end ? [start, end] : [end, start];

            // Update Label Text (Preview)
            if (this._labelEnd && !this.rangeEnd) {
                this._labelEnd.textContent = formatDate(this.hoverDate, 'd/m/Y');
                this._labelEnd.classList.add('pdp-preview-active');
            }

            const cells = this._daysGrid.querySelectorAll('.pdp-day');
            cells.forEach(cell => {
                const d = cell._date;
                if (!d) return;

                // Reset classes that depend on range
                cell.classList.remove('pdp-in-range', 'pdp-range-start', 'pdp-range-end');
                
                // Re-apply based on current hover/select state
                if (isSameDay(d, this.rangeStart)) cell.classList.add('pdp-range-start');
                if (this.rangeEnd && isSameDay(d, this.rangeEnd)) cell.classList.add('pdp-range-end');

                if (isBetween(d, s, e)) {
                    cell.classList.add('pdp-in-range');
                }

                // If hovering (and rangeEnd not set yet), show where it would end
                if (!this.rangeEnd && isSameDay(d, this.hoverDate)) {
                    cell.classList.add(d < start ? 'pdp-range-start' : 'pdp-range-end');
                }
            });
        }

        _onDayClick(date) {
            if (this.opts.mode === 'single') {
                this.selectedDate = date;
                this.trigger.value = formatDate(date, this.opts.dateFormat);
                this._render();
                if (this.opts.onSelect) this.opts.onSelect(date);
                if (this.opts.onChange) this.opts.onChange([date]);
                setTimeout(() => this.close(), 150);
            } else {
                if (!this.rangeStart || this.rangeEnd) {
                    this.rangeStart = date;
                    this.rangeEnd = null;
                    this.hoverDate = null;
                } else {
                    if (date < this.rangeStart) {
                        this.rangeEnd = this.rangeStart;
                        this.rangeStart = date;
                    } else {
                        this.rangeEnd = date;
                    }
                    this.hoverDate = null;
                    if (this.opts.onSelect) this.opts.onSelect(this.rangeStart, this.rangeEnd);
                }
                this._render();
                if (this.opts.onChange) {
                    this.opts.onChange(this.rangeEnd ? [this.rangeStart, this.rangeEnd] : [this.rangeStart]);
                }
            }
        }

        // ---- Lifecycle ----
        _bindTrigger() {
            this.trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.isOpen ? this.close() : this.open();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.close();
            });
        }

        open() {
            if (this.isOpen) return;
            this.isOpen = true;
            instances.forEach(inst => inst !== this && inst.close());

            this._position();
            this.backdropEl = document.createElement('div');
            this.backdropEl.className = 'pdp-backdrop';
            this.backdropEl.addEventListener('click', () => this.close());
            document.body.appendChild(this.backdropEl);

            this._render();
            requestAnimationFrame(() => this.containerEl.classList.add('pdp-open'));
        }

        close() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.containerEl.classList.remove('pdp-open');
            if (this.backdropEl) {
                this.backdropEl.remove();
                this.backdropEl = null;
            }
            this._closeMonthDropdown();
            this._closeYearDropdown();
        }

        _position() {
            const rect = this.trigger.getBoundingClientRect();
            const pickerWidth = 340;
            const pickerHeight = 420; // Estimated height with padding
            const padding = 10;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let top = rect.bottom + window.scrollY + padding;
            let left = rect.left + window.scrollX;

            const placement = this.opts.placement;

            if (placement === 'right' || (placement === 'auto' && rect.bottom + pickerHeight > windowHeight)) {
                // Try right
                if (rect.right + pickerWidth + padding < windowWidth) {
                    top = rect.top + window.scrollY;
                    left = rect.right + window.scrollX + padding;
                } else if (rect.left - pickerWidth - padding > 0) {
                    // Try left
                    top = rect.top + window.scrollY;
                    left = rect.left + window.scrollX - pickerWidth - padding;
                } else if (rect.top - pickerHeight - padding > 0) {
                    // Try top
                    top = rect.top + window.scrollY - pickerHeight - padding;
                    left = rect.left + window.scrollX;
                }
            } else if (placement === 'left') {
                top = rect.top + window.scrollY;
                left = rect.left + window.scrollX - pickerWidth - padding;
            } else if (placement === 'top') {
                top = rect.top + window.scrollY - pickerHeight - padding;
            }

            // Final boundary safety
            left = Math.max(padding, Math.min(windowWidth - pickerWidth - padding, left));
            top = Math.max(padding, top);

            this.containerEl.style.top = `${top}px`;
            this.containerEl.style.left = `${left}px`;
        }

        clear() {
            this.selectedDate = null;
            this.rangeStart = null;
            this.rangeEnd = null;
            this.hoverDate = null;
            this.trigger.value = '';
            this._render();
            if (this.opts.onClear) this.opts.onClear();
            if (this.opts.onChange) this.opts.onChange([]);
        }

        destroy() {
            this.close();
            this.containerEl.remove();
            instances.delete(this.trigger);
        }
    }

    return {
        attach(selector, opts) {
            const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
            if (!el) return null;
            if (instances.has(el)) instances.get(el).destroy();
            const inst = new DatePickerInstance(el, opts);
            instances.set(el, inst);
            return inst;
        },
        formatDate,
        parseDate
    };
})();
window.PremiumDatePicker = PremiumDatePicker;
