/**
 * 安全监控工具
 * 用于检测和记录可疑活动
 */

interface SuspiciousActivity {
  type: string;
  details: Record<string, unknown>;
  timestamp: number;
  userAgent: string;
  url: string;
}

export class SecurityMonitor {
  private static suspiciousActivities: SuspiciousActivity[] = [];
  private static maxActivities = 50;

  /**
   * 记录可疑活动
   * @param type - 活动类型
   * @param details - 详细信息
   */
  static recordSuspiciousActivity(
    type: string,
    details: Record<string, unknown>
  ): void {
    const activity: SuspiciousActivity = {
      type,
      details,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    this.suspiciousActivities.push(activity);

    // 限制数量
    if (this.suspiciousActivities.length > this.maxActivities) {
      this.suspiciousActivities = this.suspiciousActivities.slice(
        -this.maxActivities
      );
    }

    // 发送到后端
    this.reportToBackend(activity);

    console.warn("[Security] Suspicious activity detected:", activity);
  }

  /**
   * 发送可疑活动报告到后端
   */
  private static async reportToBackend(
    activity: SuspiciousActivity
  ): Promise<void> {
    try {
      await fetch("/api/security/suspicious-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activity),
      });
    } catch {
      // 静默失败，不影响主流程
    }
  }

  /**
   * 获取所有可疑活动记录
   */
  static getActivities(): SuspiciousActivity[] {
    return [...this.suspiciousActivities];
  }

  /**
   * 清空记录
   */
  static clearActivities(): void {
    this.suspiciousActivities = [];
  }

  /**
   * 导出记录（用于调试或审计）
   */
  static exportActivities(): string {
    return JSON.stringify(this.suspiciousActivities, null, 2);
  }
}
