import type { ChecklistDefinition } from "./types";

export const congKhuA: ChecklistDefinition = {
  key: "cong-khu-a",
  title: "Checklist ra vào cổng Khu A",
  groups: [
    {
      title: "Hệ thống kiểm soát ra vào cổng",
      items: [
        {
          key: "khu-a-may-server",
          label: "Máy Server",
          standard:
            "CPU, LCD, Windows Server hoạt động bình thường (xoá rác vào ngày 01 và 15 hàng tháng).",
          type: "pass_fail",
          subchecks: [
            { key: "disk-c", label: "C: Windows — trống ≥ 60%" },
            { key: "disk-f", label: "F: Hình xe — trống ≥ 40%" },
            { key: "disk-g", label: "G: Hình SV — trống ≥ 70%" },
          ],
        },
        {
          key: "khu-a-may-ks-xe-loi-ra",
          label: "Máy kiểm soát xe lối ra",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường.",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows — trống ≥ 60%" }],
        },
        {
          key: "khu-a-may-ks-xe-loi-vao",
          label: "Máy kiểm soát xe lối vào",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường.",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows — trống ≥ 60%" }],
        },
        {
          key: "khu-a-may-ks-bo-hanh-loi-ra",
          label: "Máy kiểm soát bộ hành lối ra",
          standard:
            "CPU, LCD, phần mềm kiểm soát bộ hành, kết nối mạng hoạt động bình thường.",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows — trống ≥ 60%" }],
        },
        {
          key: "khu-a-may-ks-bo-hanh-loi-vao",
          label: "Máy kiểm soát bộ hành lối vào",
          standard:
            "CPU, LCD, phần mềm kiểm soát bộ hành, kết nối mạng hoạt động bình thường.",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows — trống ≥ 60%" }],
        },
        {
          key: "khu-a-rfid-xe-may",
          label: "Đầu quét thẻ RFID (Xe máy)",
          standard: "8 đầu quét thẻ có báo đèn và quét thẻ bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-a-gp90-bo-hanh",
          label: "Đầu quét thẻ GP90 (Bộ hành)",
          standard: "3 đầu quét thẻ có báo đèn và quét thẻ bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-a-camera-cong",
          label: "Hệ thống camera kiểm soát cổng ra vào",
          standard: "10 camera không bị mất kết nối.",
          type: "pass_fail",
        },
      ],
    },
    {
      title: "Thiết bị & hạ tầng cổng",
      items: [
        {
          key: "khu-a-barie",
          label: "Hệ thống Barie kiểm soát cổng ra vào",
          standard: "4 Barie hoạt động bình thường + Remote hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-a-rada",
          label: "Rada cảm biến",
          standard: "4 cảm biến hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-a-ups-apc",
          label: "Hệ thống lưu điện APC-1",
          standard: "Hoạt động bình thường, không báo lỗi.",
          type: "pass_fail",
        },
        {
          key: "khu-a-ip-phone",
          label: "Điện thoại IP phone",
          standard: "01 điện thoại IP có nhận số nội bộ trên màn hình.",
          type: "pass_fail",
        },
        {
          key: "khu-a-mang-internet",
          label: "Mạng Internet",
          standard: "Kết nối bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-a-camera-vong-ngoai",
          label: "Camera vòng ngoài",
          standard: "59 camera.",
          type: "pass_fail",
        },
        {
          key: "khu-a-camera-do-thi",
          label: "Camera đô thị",
          standard: "11 camera.",
          type: "pass_fail",
        },
      ],
    },
    {
      title: "PHÒNG SERVER A7",
      items: [
        {
          key: "khu-a-phong-a7-dau-ghi",
          label: "Đầu ghi",
          standard: "02 đầu ghi hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-a-phong-a7-may-lanh",
          label: "Máy lạnh",
          standard: "02 máy lạnh hoạt động bình thường.",
          type: "pass_fail",
        },
      ],
    },
  ],
};
