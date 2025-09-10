export interface TableColumn {
  title: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

export class Table {
  private columns: TableColumn[];
  private rows: string[][] = [];

  constructor(columns: TableColumn[]) {
    this.columns = columns;
  }

  addRow(...values: string[]): void {
    if (values.length !== this.columns.length) {
      throw new Error(`Expected ${this.columns.length} values, got ${values.length}`);
    }
    this.rows.push(values);
  }

  toString(): string {
    // Calculate column widths
    const widths = this.columns.map(col => col.width);
    
    // Create header
    const header = this.columns.map((col, i) => {
      return this.padString(col.title, widths[i], col.align || 'left');
    }).join(' | ');
    
    // Create separator
    const separator = widths.map(width => '-'.repeat(width)).join('-|-');
    
    // Create rows
    const rows = this.rows.map(row => {
      return row.map((cell, i) => {
        return this.padString(cell, widths[i], this.columns[i].align || 'left');
      }).join(' | ');
    }).join('\n');
    
    return `${header}\n${separator}\n${rows}`;
  }

  private padString(str: string, width: number, align: 'left' | 'right' | 'center'): string {
    if (str.length >= width) {
      return str.substring(0, width);
    }
    
    switch (align) {
      case 'right':
        return ' '.repeat(width - str.length) + str;
      case 'center':
        const padLeft = Math.floor((width - str.length) / 2);
        const padRight = width - str.length - padLeft;
        return ' '.repeat(padLeft) + str + ' '.repeat(padRight);
      case 'left':
      default:
        return str + ' '.repeat(width - str.length);
    }
  }
}