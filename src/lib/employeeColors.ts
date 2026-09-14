export interface EmployeeColor {
  solid: string;
  soft: string;
}

const EMPLOYEE_COLOR: EmployeeColor = {
  solid: "#2563eb",
  soft: "#eff6ff"
};

export function getEmployeeColor(identifier: string): EmployeeColor {
  void identifier;
  return EMPLOYEE_COLOR;
}
