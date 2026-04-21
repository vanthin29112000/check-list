import type { ChecklistDefinition, ChecklistGroupDef, ChecklistItemDef } from "./types";

function item(key: string, label: string, standard: string): ChecklistItemDef {
  return { key, label, standard, type: "pass_fail" };
}

function buildPhongServerGroups(): ChecklistGroupDef[] {
  const stdPhysical = "LCD không báo lỗi, đèn tín hiệu màu xanh lá hoặc xanh dương";
  const stdSwitchFw = "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá";
  const stdUps = "LCD báo trạng thái ổn, không báo lỗi";

  const g1: ChecklistGroupDef = {
    title: "Thiết bị vật lý",
    items: [
      item("ps-1-1", "Dell EMC R650 -1", stdPhysical),
      item("ps-1-2", "Dell EMC R650 -2", stdPhysical),
      item("ps-1-3", "Dell EMC PV ME5024", stdPhysical),
      item("ps-1-4", "Dell EMC R750", stdPhysical),
      item("ps-1-5", "Máy chủ iVSS", stdPhysical),
      item("ps-1-6", "Thiết bị lưu trữ VMS", stdPhysical),
    ],
  };
  const g2: ChecklistGroupDef = {
    title: "Thiết bị Switch",
    items: [
      item("ps-2-1", "Switch Cisco SG300-20", stdSwitchFw),
      item("ps-2-2", "Dell EMC S3148 -1", stdSwitchFw),
      item("ps-2-3", "Dell EMC S3148 -2", stdSwitchFw),
      item("ps-2-4", "Dell EMC S4128F-ON -1", stdSwitchFw),
      item("ps-2-5", "Dell EMC S4128F-ON -2", stdSwitchFw),
    ],
  };
  const g3: ChecklistGroupDef = {
    title: "Thiết bị Firewall",
    items: [
      item("ps-3-1", "Fortigate 200F -1", stdSwitchFw),
      item("ps-3-2", "Fortigate 200F -2", stdSwitchFw),
    ],
  };
  const g4: ChecklistGroupDef = {
    title: "Thiết bị Access Point",
    items: [item("ps-4-1", "Access Point Khu A", "5 AP không bị mất kết nối")],
  };
  const g5: ChecklistGroupDef = {
    title: "Thiết bị khác",
    items: [
      item("ps-5-1", "NAS DS1522+", "Đèn vàng"),
      item("ps-5-2", "Hệ thống lưu điện Santak -1", stdUps),
      item("ps-5-3", "Hệ thống lưu điện Santak -2", stdUps),
    ],
  };
  const websites: [string, string][] = [
    ["ps-6-1", "Sinh viên nội trú"],
    ["ps-6-2", "Quản lý sinh viên"],
    ["ps-6-3", "Trang chủ trung tâm"],
    ["ps-6-4", "Thư viện ảnh"],
    ["ps-6-5", "Không gian văn hóa HCM"],
    ["ps-6-6", "Thanh tra pháp chế"],
    ["ps-6-7", "Xác thực thông tin"],
    ["ps-6-8", "Quản lý tài khoản"],
    ["ps-6-9", "Quản lý cây xanh"],
    ["ps-6-10", "Hướng dẫn thông tin"],
    ["ps-6-11", "Tham quan KTX Online"],
    ["ps-6-12", "Quản lý tài sản"],
    ["ps-6-13", "Quản lý nhân sự"],
    ["ps-6-14", "Quản lý FaceID"],
    ["ps-6-15", "Báo cáo thông minh"],
  ];
  const g6: ChecklistGroupDef = {
    title: "Hệ thống phần mềm website",
    items: websites.map(([k, lbl]) => item(k, lbl, "Hiển thị được nội dung trên website")),
  };
  const g7: ChecklistGroupDef = {
    title: "Hệ thống giám sát thiết bị",
    items: [item("ps-7-1", "Hệ thống giám sát thiết bị", "Không có thiết bị báo màu đỏ")],
  };
  const g8: ChecklistGroupDef = {
    title: "Kiểm tra tốc độ đường truyền mạng",
    items: [item("ps-8-1", "Kiểm tra tốc độ đường truyền mạng", "Đảm bảo tốc độ đường truyền 300Mbps")],
  };
  const g9: ChecklistGroupDef = {
    title: "Nhiệt độ, độ ẩm phòng máy chủ",
    items: [item("ps-9-1", "Nhiệt độ, độ ẩm phòng máy chủ", "Nhiệt độ từ 16-21°C\nĐộ ẩm < 55%")],
  };
  const g10: ChecklistGroupDef = {
    title: "Hệ thống PCCC",
    items: [item("ps-10-1", "Hệ thống PCCC", "Đèn báo màu vàng")],
  };
  const g11: ChecklistGroupDef = {
    title: "Thiết bị kiểm soát ra vào",
    items: [item("ps-11-1", "Thiết bị kiểm soát ra vào", "Phản hồi tốt khi quét")],
  };
  const g12: ChecklistGroupDef = {
    title: "Hệ thống camera kiểm soát cổng ra vào",
    items: [item("ps-12-1", "Hệ thống camera kiểm soát cổng ra vào", "28 Camera không bị mất kết nối")],
  };
  const g13: ChecklistGroupDef = {
    title: "Controller Wifi",
    items: [
      item("ps-13-1", "Aruba", ""),
      item("ps-13-2", "Unifi", ""),
    ],
  };
  const g14: ChecklistGroupDef = {
    title: "Backup dữ liệu",
    items: [
      item("ps-14-1", "Server đến Onedrive", ""),
      item("ps-14-2", "Server đến NAS", ""),
      item("ps-14-3", "NAS đến HDD Local", ""),
    ],
  };
  return [g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13, g14];
}

export const phongServer: ChecklistDefinition = {
  key: "phong-server",
  title: "DAILY CHECKLIST HỆ THỐNG PHÒNG MÁY CHỦ",
  groups: buildPhongServerGroups(),
};
