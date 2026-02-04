declare class EmailService {
    constructor();
    /**
     * Send OTP email (HTML format)
     */
    sendOTPEmail(to: string, firstName: string, otp: string, type: 'verification' | 'password_reset'): Promise<void>;
    /**
     * Send welcome email after verification
     */
    sendWelcomeEmail(to: string, firstName: string): Promise<void>;
    /**
     * Send document status notification email
     */
    sendDocumentNotificationEmail(to: string, firstName: string, documentType: string, status: 'approved' | 'rejected' | 'replacement_requested', notes?: string, rejectionReason?: string): Promise<void>;
    /**
     * Send admin notification email for new document submissions
     */
    sendAdminDocumentNotificationEmail(adminEmail: string, documentType: string, driverName: string, documentCount: number): Promise<void>;
    /**
     * Send generic email via ZeptoMail API
     */
    private sendEmail;
    /**
     * OTP Email Template (HTML)
     */
    private getOTPEmailTemplate;
    /**
     * Welcome Email Template
     */
    private getWelcomeEmailTemplate;
    /**
     * Get document notification subject based on status
     */
    private getDocumentNotificationSubject;
    /**
     * Document notification email template
     */
    private getDocumentNotificationTemplate;
    /**
     * Admin notification email template
     */
    private getAdminDocumentNotificationTemplate;
}
declare const _default: EmailService;
export default _default;
//# sourceMappingURL=email.service.d.ts.map