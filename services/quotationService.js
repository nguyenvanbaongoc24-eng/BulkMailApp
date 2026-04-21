const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Quotation Service - Generates professional PDFs from HTML templates
 */
class QuotationService {
    constructor() {
        this.templateDir = path.join(__dirname, '..', 'data');
        this.baseTemplate = 'quotation_template.html';
    }

    /**
     * Generate PDF from quotation data
     * @param {Object} data - Quotation data (customer_name, mst, service, duration, price, date)
     */
    async generatePdf(data) {
        let browser = null;
        try {
            const templatePath = path.join(this.templateDir, this.baseTemplate);
            if (!fs.existsSync(templatePath)) {
                // Create a basic fallback template if it doesn't exist
                await this.createDefaultTemplate();
            }

            let html = fs.readFileSync(templatePath, 'utf8');

            // Formatter for currency
            const formatter = new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
            });

            // Replace placeholders
            const placeholders = {
                '{{CustomerName}}': data.customer_name || 'N/A',
                '{{MST}}': data.mst || 'N/A',
                '{{Service}}': data.service || 'N/A',
                '{{Duration}}': data.duration || 'N/A',
                '{{Price}}': formatter.format(data.price || 0),
                '{{Date}}': new Date().toLocaleDateString('vi-VN'),
                '{{QuoteID}}': data.id.substring(0, 8).toUpperCase(),
                '{{Total}}': formatter.format(data.price || 0)
            };

            for (const [key, value] of Object.entries(placeholders)) {
                html = html.split(key).join(value);
            }

            // Launch browser
            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    bottom: '20mm',
                    left: '15mm',
                    right: '15mm'
                }
            });

            return pdfBuffer;
        } catch (err) {
            console.error('[QuotationService] Error generating PDF:', err);
            throw err;
        } finally {
            if (browser) await browser.close();
        }
    }

    async createDefaultTemplate() {
        const template = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Arial', sans-serif; color: #333; line-height: 1.6; }
                .header { border-bottom: 2px solid #f97316; padding-bottom: 20px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-start; }
                .logo { font-size: 28px; font-weight: bold; color: #f97316; }
                .title { font-size: 32px; font-weight: 900; text-align: center; color: #1e293b; margin-bottom: 40px; text-transform: uppercase; }
                .info-section { margin-bottom: 30px; }
                .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; }
                .label { font-weight: bold; color: #64748b; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 12px; text-align: left; font-size: 14px; text-transform: uppercase; color: #64748b; }
                td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 15px; }
                .total-row { background: #f8fafc; font-weight: bold; font-size: 18px; }
                .total-label { text-align: right; }
                .footer { margin-top: 60px; text-align: center; font-size: 13px; color: #94a3b8; }
                .signature-box { margin-top: 60px; display: flex; justify-content: space-between; }
                .signature { text-align: center; width: 250px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">Automation CA2</div>
                <div style="text-align: right; font-size: 12px; color: #64748b;">
                    Số b/giá: #{{QuoteID}}<br>
                    Ngày: {{Date}}
                </div>
            </div>

            <h1 class="title">Báo Giá Dịch Vụ</h1>

            <div class="info-section">
                <h3 style="border-left: 4px solid #f97316; padding-left: 10px; margin-bottom: 15px;">Thông tin khách hàng</h3>
                <div class="info-grid">
                    <div class="label">Khách hàng:</div>
                    <div>{{CustomerName}}</div>
                    <div class="label">Mã số thuế:</div>
                    <div>{{MST}}</div>
                </div>
            </div>

            <div class="info-section">
                <h3 style="border-left: 4px solid #f97316; padding-left: 10px; margin-bottom: 15px;">Nội dung cung cấp</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Mô tả dịch vụ</th>
                            <th>Thời hạn</th>
                            <th style="text-align: right;">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="font-weight: bold;">{{Service}}</td>
                            <td>{{Duration}}</td>
                            <td style="text-align: right;">{{Price}}</td>
                        </tr>
                        <tr class="total-row">
                            <td colspan="2" class="total-label">Tổng cộng (Đã bao gồm VAT):</td>
                            <td style="text-align: right; color: #f97316;">{{Total}}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="signature-box">
                <div class="signature">
                    <p class="label">Khách hàng</p>
                    <div style="height: 100px;"></div>
                    <p>(Ký, ghi rõ họ tên)</p>
                </div>
                <div class="signature">
                    <p class="label">Đại diện Automation CA2</p>
                    <div style="height: 100px;"></div>
                    <p><b>Trung tâm hỗ trợ CA2</b></p>
                </div>
            </div>

            <div class="footer">
                Công ty Cổ phần Công nghệ Thẻ Nacencomm<br>
                Tầng 5 Tòa Nhà Hanel, Số 2 Chùa Bộc, Đống Đa, Hà Nội<br>
                Hotline: 0356 230 550 | Website: www.nacencomm.vn
            </div>
        </body>
        </html>
        `;
        if (!fs.existsSync(this.templateDir)) {
            fs.mkdirSync(this.templateDir);
        }
        fs.writeFileSync(path.join(this.templateDir, this.baseTemplate), template);
    }
}

module.exports = new QuotationService();
