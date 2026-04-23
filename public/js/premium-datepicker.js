/**
 * PremiumDatePicker — Antigravity Design System
 * Zero-dependency, iOS/macOS inspired date picker component.
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
        // Accept Y-m-d or d/m/Y
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

            if (!this.trigger) {
                console.warn('[PremiumDatePicker] Trigger element not found:', triggerEl);
                return;
            }

            this.opts = Object.assign({
                mode: 'single',          // 'single' | 'range'
                dateFormat: 'Y-m-d',     // Output format for input value
                displayFormat: 'd/m/Y',  // Visual display format
                label: null,             // Top label text (e.g. "CHỌN NGÀY")
                showFooter: false,       // Show cancel/apply buttons
                minYear: 2015,
                maxYear: 2035,
                appendTo: null,          // Custom parent element
                onSelect: null,          // (date) for single, (start, end) for range
                onClear: null,
                onChange: null,           // Fires on any date click (before range complete)
            }, opts);

            if (this.opts.mode === 'range') {
                this.opts.showFooter = true;
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

            // Read initial value from input
            if (this.trigger.value) {
                const parsed = parseDate(this.trigger.value);
                if (parsed) {
                    this.selectedDate = parsed;
                    this.viewYear = parsed.getFullYear();
                    this.viewMonth = parsed.getMonth();
                }
            }

            this._build();
            this._bindTrigger();
        }

        // ---- Build DOM ----
        _build() {
            // Container
            this.containerEl = document.createElement('div');
            this.containerEl.className = 'pdp-container';
            this.containerEl.setAttribute('data-pdp', 'true');

            // Label
            if (this.opts.label) {
                const label = document.createElement('div');
                label.className = 'pdp-label';
                label.innerHTML = `<span>${this.opts.label}</span><i class="fas fa-calendar-check" style="opacity:0.3; font-size:11px"></i>`;
                this.containerEl.appendChild(label);
            }

            // Header
            const header = document.createElement('div');
            header.className = 'pdp-header';

            this._prevBtn = this._createNavBtn('fas fa-chevron-left', () => this._navigate(-1));
            this._nextBtn = this._createNavBtn('fas fa-chevron-right', () => this._navigate(1));
            this._selectors = document.createElement('div');
            this._selectors.className = 'pdp-selectors';

            // Month dropdown
            this._monthWrap = this._createSelectDropdown('month');
            // Year dropdown
            this._yearWrap = this._createSelectDropdown('year');

            this._selectors.appendChild(this._monthWrap);
            this._selectors.appendChild(this._yearWrap);

            header.appendChild(this._prevBtn);
            header.appendChild(this._selectors);
            header.appendChild(this._nextBtn);

            this.containerEl.appendChild(header);

            // Weekdays
            const weekdays = document.createElement('div');
            weekdays.className = 'pdp-weekdays';
            WEEKDAYS.forEach(d => {
                const el = document.createElement('div');
                el.className = 'pdp-weekday';
                el.textContent = d;
                weekdays.appendChild(el);
            });
            this.containerEl.appendChild(weekdays);

            // Days grid
            this._daysGrid = document.createElement('div');
            this._daysGrid.className = 'pdp-days';
            this.containerEl.appendChild(this._daysGrid);

            // Footer (range mode)
            if (this.opts.showFooter) {
                const footer = document.createElement('div');
                footer.className = 'pdp-footer';

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'pdp-footer-btn pdp-cancel';
                cancelBtn.textContent = 'Hủy';
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._clear();
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
            this.containerEl.addEventListener('mousedown', (e) => e.stopPropagation());
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
                if (type === 'month') {
                    this._toggleMonthDropdown();
                } else {
                    this._toggleYearDropdown();
                }
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

        // ---- Dropdowns ----
        _toggleMonthDropdown() {
            this._closeYearDropdown();
            this.monthDropdownOpen = !this.monthDropdownOpen;

            if (this.monthDropdownOpen) {
                this._monthBtn.classList.add('pdp-dropdown-open');
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

                // Show with animation
                requestAnimationFrame(() => {
                    this._monthDropdown.classList.add('pdp-dropdown-visible');
                });

                // Scroll active item into view
                setTimeout(() => {
                    const active = this._monthDropdown.querySelector('.pdp-active');
                    if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 50);
            } else {
                this._closeMonthDropdown();
            }
        }

        _closeMonthDropdown() {
            this.monthDropdownOpen = false;
            this._monthBtn.classList.remove('pdp-dropdown-open');
            this._monthDropdown.classList.remove('pdp-dropdown-visible');
        }

        _toggleYearDropdown() {
            this._closeMonthDropdown();
            this.yearDropdownOpen = !this.yearDropdownOpen;

            if (this.yearDropdownOpen) {
                this._yearBtn.classList.add('pdp-dropdown-open');
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

                requestAnimationFrame(() => {
                    this._yearDropdown.classList.add('pdp-dropdown-visible');
                });

                setTimeout(() => {
                    const active = this._yearDropdown.querySelector('.pdp-active');
                    if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 50);
            } else {
                this._closeYearDropdown();
            }
        }

        _closeYearDropdown() {
            this.yearDropdownOpen = false;
            this._yearBtn.classList.remove('pdp-dropdown-open');
            this._yearDropdown.classList.remove('pdp-dropdown-visible');
        }

        // ---- Navigation ----
        _navigate(direction) {
            this.viewMonth += direction;
            if (this.viewMonth < 0) {
                this.viewMonth = 11;
                this.viewYear--;
            } else if (this.viewMonth > 11) {
                this.viewMonth = 0;
                this.viewYear++;
            }
            this._render();
        }

        // ---- Render ----
        _render() {
            // Update selectors text
            this._monthText.textContent = MONTHS[this.viewMonth];
            this._yearText.textContent = this.viewYear;

            // Build day cells
            this._daysGrid.innerHTML = '';
            const totalDays = daysInMonth(this.viewYear, this.viewMonth);
            const startDay = startDayOfMonth(this.viewYear, this.viewMonth);

            // Previous month fill
            const prevMonthDays = daysInMonth(
                this.viewMonth === 0 ? this.viewYear - 1 : this.viewYear,
                this.viewMonth === 0 ? 11 : this.viewMonth - 1
            );

            for (let i = startDay - 1; i >= 0; i--) {
                const dayNum = prevMonthDays - i;
                const cell = this._createDayCell(dayNum, true);
                this._daysGrid.appendChild(cell);
            }

            // Current month
            for (let d = 1; d <= totalDays; d++) {
                const date = new Date(this.viewYear, this.viewMonth, d);
                const cell = this._createDayCell(d, false, date);
                this._daysGrid.appendChild(cell);
            }

            // Next month fill
            const totalCells = startDay + totalDays;
            const remaining = (Math.ceil(totalCells / 7) * 7) - totalCells;
            for (let i = 1; i <= remaining; i++) {
                const cell = this._createDayCell(i, true);
                this._daysGrid.appendChild(cell);
            }
        }

        _createDayCell(dayNum, isOutside, date) {
            const cell = document.createElement('div');
            cell.className = 'pdp-day';
            cell.textContent = dayNum;

            if (isOutside) {
                cell.classList.add('pdp-outside', 'pdp-disabled');
                return cell;
            }

            // Today
            if (isToday(date)) {
                cell.classList.add('pdp-today');
            }

            // Single mode selected
            if (this.opts.mode === 'single' && isSameDay(date, this.selectedDate)) {
                cell.classList.add('pdp-selected');
            }

            // Range mode
            if (this.opts.mode === 'range') {
                const isStart = isSameDay(date, this.rangeStart);
                const isEnd = isSameDay(date, this.rangeEnd);
                const effectiveEnd = this.rangeEnd || this.hoverDate;

                if (isStart) cell.classList.add('pdp-range-start');
                if (isEnd) cell.classList.add('pdp-range-end');

                if (this.rangeStart && effectiveEnd) {
                    const [lo, hi] = this.rangeStart <= effectiveEnd
                        ? [this.rangeStart, effectiveEnd]
                        : [effectiveEnd, this.rangeStart];

                    if (isBetween(date, lo, hi)) {
                        cell.classList.add('pdp-in-range');
                    }

                    // Hover-based start/end for preview
                    if (!this.rangeEnd && this.hoverDate) {
                        if (isSameDay(date, this.hoverDate) && !isStart) {
                            cell.classList.add(date < this.rangeStart ? 'pdp-range-start' : 'pdp-range-end');
                        }
                    }
                }
            }

            // Click handler
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this._onDayClick(date);
            });

            // Hover handler (range mode)
            if (this.opts.mode === 'range') {
                cell.addEventListener('mouseenter', () => {
                    if (this.rangeStart && !this.rangeEnd) {
                        this.hoverDate = date;
                        this._render();
                    }
                });
            }

            return cell;
        }

        _onDayClick(date) {
            if (this.opts.mode === 'single') {
                this.selectedDate = date;
                this.trigger.value = formatDate(date, this.opts.dateFormat);
                this._render();

                if (this.opts.onSelect) this.opts.onSelect(date);
                if (this.opts.onChange) this.opts.onChange([date]);

                // Auto-close for single mode
                setTimeout(() => this.close(), 120);

            } else if (this.opts.mode === 'range') {
                if (!this.rangeStart || this.rangeEnd) {
                    // Start new range
                    this.rangeStart = date;
                    this.rangeEnd = null;
                    this.hoverDate = null;
                    this._render();
                    if (this.opts.onChange) this.opts.onChange([date]);
                } else {
                    // Complete range
                    if (date < this.rangeStart) {
                        this.rangeEnd = this.rangeStart;
                        this.rangeStart = date;
                    } else {
                        this.rangeEnd = date;
                    }
                    this.hoverDate = null;
                    this._render();

                    if (this.opts.onSelect) this.opts.onSelect(this.rangeStart, this.rangeEnd);
                    if (this.opts.onChange) this.opts.onChange([this.rangeStart, this.rangeEnd]);
                }
            }
        }

        // ---- Trigger binding ----
        _bindTrigger() {
            this._triggerClickHandler = (e) => {
                e.stopPropagation();
                if (this.isOpen) {
                    this.close();
                } else {
                    this.open();
                }
            };

            this.trigger.addEventListener('click', this._triggerClickHandler);

            // ESC to close
            this._escHandler = (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            };
            document.addEventListener('keydown', this._escHandler);
        }

        // ---- Open / Close ----
        open() {
            if (this.isOpen) return;
            this.isOpen = true;

            // Close all other instances
            instances.forEach((inst, key) => {
                if (inst !== this && inst.isOpen) inst.close();
            });

            // Position
            this._position();

            // Add backdrop
            this.backdropEl = document.createElement('div');
            this.backdropEl.className = 'pdp-backdrop';
            this.backdropEl.addEventListener('click', () => this.close());
            document.body.appendChild(this.backdropEl);

            // Close dropdowns
            this._closeMonthDropdown();
            this._closeYearDropdown();

            // Render
            this._render();

            // Animate open
            requestAnimationFrame(() => {
                this.containerEl.classList.remove('pdp-closing');
                this.containerEl.classList.add('pdp-open');
            });
        }

        close() {
            if (!this.isOpen) return;
            this.isOpen = false;

            this._closeMonthDropdown();
            this._closeYearDropdown();

            this.containerEl.classList.remove('pdp-open');
            this.containerEl.classList.add('pdp-closing');

            // Remove backdrop
            if (this.backdropEl) {
                this.backdropEl.remove();
                this.backdropEl = null;
            }

            // Wait for animation to finish
            setTimeout(() => {
                this.containerEl.classList.remove('pdp-closing');
            }, 180);
        }

        _position() {
            const rect = this.trigger.getBoundingClientRect();
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            const scrollX = window.scrollX || document.documentElement.scrollLeft;
            const containerWidth = 320;
            const containerHeight = 400;

            let top = rect.bottom + scrollY + 8;
            let left = rect.left + scrollX;

            // Check if it goes off screen bottom
            if (rect.bottom + containerHeight + 8 > window.innerHeight) {
                top = rect.top + scrollY - containerHeight - 8;
            }

            // Check if it goes off screen right
            if (left + containerWidth > window.innerWidth) {
                left = window.innerWidth - containerWidth - 16;
            }

            // Prevent going off left
            if (left < 8) left = 8;

            this.containerEl.style.top = `${top}px`;
            this.containerEl.style.left = `${left}px`;
        }

        // ---- Public API ----
        _clear() {
            this.selectedDate = null;
            this.rangeStart = null;
            this.rangeEnd = null;
            this.hoverDate = null;

            if (this.opts.mode === 'single') {
                this.trigger.value = '';
            }

            if (this.opts.onClear) this.opts.onClear();
            if (this.opts.onChange) this.opts.onChange([]);
            this._render();
        }

        clear() {
            this._clear();
        }

        setDate(dateStr) {
            const d = parseDate(dateStr);
            if (d) {
                this.selectedDate = d;
                this.viewYear = d.getFullYear();
                this.viewMonth = d.getMonth();
                this.trigger.value = formatDate(d, this.opts.dateFormat);
                if (this.isOpen) this._render();
            }
        }

        setRange(startStr, endStr) {
            const s = parseDate(startStr);
            const e = parseDate(endStr);
            if (s) {
                this.rangeStart = s;
                this.viewYear = s.getFullYear();
                this.viewMonth = s.getMonth();
            }
            if (e) this.rangeEnd = e;
            if (this.isOpen) this._render();
        }

        destroy() {
            this.close();
            this.trigger.removeEventListener('click', this._triggerClickHandler);
            document.removeEventListener('keydown', this._escHandler);
            if (this.containerEl) this.containerEl.remove();
            instances.delete(this.trigger);
        }
    }

    // ---- Public API ----
    return {
        /**
         * Attach a date picker to an element.
         * @param {string|HTMLElement} selector - CSS selector or DOM element
         * @param {Object} opts - Configuration options
         * @returns {DatePickerInstance}
         */
        attach(selector, opts = {}) {
            const el = typeof selector === 'string'
                ? document.querySelector(selector)
                : selector;

            if (!el) {
                console.warn('[PremiumDatePicker] Element not found:', selector);
                return null;
            }

            // Destroy existing instance if any
            if (instances.has(el)) {
                instances.get(el).destroy();
            }

            const instance = new DatePickerInstance(el, opts);
            if (instance.trigger) {
                instances.set(el, instance);
            }
            return instance;
        },

        /**
         * Get instance attached to an element.
         */
        getInstance(selector) {
            const el = typeof selector === 'string'
                ? document.querySelector(selector)
                : selector;
            return instances.get(el) || null;
        },

        /**
         * Destroy all instances.
         */
        destroyAll() {
            instances.forEach(inst => inst.destroy());
            instances.clear();
        },

        /**
         * Format a date string.
         */
        formatDate: formatDate,

        /**
         * Parse a date string.
         */
        parseDate: parseDate
    };
})();

window.PremiumDatePicker = PremiumDatePicker;
