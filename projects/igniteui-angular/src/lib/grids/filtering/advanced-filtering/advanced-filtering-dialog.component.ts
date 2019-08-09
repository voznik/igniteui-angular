import { Component, AfterViewInit, Input, ViewChild, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { PositionSettings, VerticalAlignment, HorizontalAlignment, OverlaySettings } from '../../../services/overlay/utilities';
import { ConnectedPositioningStrategy } from '../../../services/overlay/position/connected-positioning-strategy';
import { AbsoluteScrollStrategy } from '../../../services/overlay/scroll/absolute-scroll-strategy';
import { IgxFilteringService } from '../grid-filtering.service';
import { IgxOverlayService } from '../../../services/overlay/overlay';
import { DisplayDensity } from '../../../core/displayDensity';
import { IgxToggleDirective } from 'igniteui-angular';
import { IgxGridBaseComponent, IgxColumnComponent } from '../../grid';
import { FilteringExpressionsTree, IFilteringExpressionsTree } from '../../../data-operations/filtering-expressions-tree';
import { FilteringLogic, IFilteringExpression } from '../../../data-operations/filtering-expression.interface';
import { IgxStringFilteringOperand } from '../../../data-operations/filtering-condition';

class ExpressionItem {
    constructor(parent?: ExpressionGroupItem) {
        this.parent = parent;
    }
    parent: ExpressionGroupItem;
    selected: boolean;
}

class ExpressionGroupItem extends ExpressionItem {
    constructor(operator: FilteringLogic, parent?: ExpressionGroupItem) {
        super(parent);
        this.operator = operator;
        this.children = [];
    }
    operator: FilteringLogic;
    children: ExpressionItem[];
}

class ExpressionOperandItem extends ExpressionItem {
    constructor(expression: IFilteringExpression, parent: ExpressionGroupItem) {
        super(parent);
        this.expression = expression;
    }
    expression: IFilteringExpression;
    inEditMode: boolean;
    inAddMode: boolean;
}

@Component({
    // changeDetection: ChangeDetectionStrategy.OnPush,
    // preserveWhitespaces: false,
    selector: 'igx-advanced-filtering-dialog',
    templateUrl: './advanced-filtering-dialog.component.html'
})
export class IgxAdvancedFilteringDialogComponent {
    @Input()
    public filteringService: IgxFilteringService;

    @Input()
    public overlayComponentId: string;

    @Input()
    public overlayService: IgxOverlayService;

    @Input()
    public displayDensity: DisplayDensity;

    public rootGroup: ExpressionGroupItem;

    public selectedExpressions: ExpressionItem[] = [];

    public currentGroup: ExpressionGroupItem;

    public editedExpression: ExpressionOperandItem;

    public addModeExpression: ExpressionOperandItem;

    public selectedCondition: string;
    public searchValue: string;

    private _selectedColumn: IgxColumnComponent;
    private _clickTimer;
    private _dblClickDelay = 200;
    private _preventChipClick = false;

    constructor(public cdr: ChangeDetectorRef) { }

    public get selectedColumn(): IgxColumnComponent {
        return this._selectedColumn;
    }

    public set selectedColumn(value: IgxColumnComponent) {
        const oldValue = this._selectedColumn;

        if (this._selectedColumn !== value) {
            this._selectedColumn = value;
            if (oldValue && this._selectedColumn.dataType !== oldValue.dataType) {
                this.selectedCondition = null;
                this.searchValue = null;
            }
        }
    }

    get grid(): IgxGridBaseComponent {
        return this.filteringService.grid;
    }

    public addCondition(parent: ExpressionGroupItem, afterExpression?: ExpressionItem) {
        this.cancelOperandAdd();

        const operandItem = new ExpressionOperandItem({
            fieldName: null,
            condition: null,
            ignoreCase: true,
            searchVal: null
        }, parent);

        if (afterExpression) {
            const index = parent.children.indexOf(afterExpression);
            parent.children.splice(index + 1, 0, operandItem);
        } else {
            parent.children.push(operandItem);
        }

        this.enterExpressionEdit(operandItem);
    }

    public addAndGroup(parent?: ExpressionGroupItem, afterExpression?: ExpressionItem) {
        this.addGroup(FilteringLogic.And, parent, afterExpression);
    }

    public addOrGroup(parent?: ExpressionGroupItem, afterExpression?: ExpressionItem) {
        this.addGroup(FilteringLogic.Or, parent, afterExpression);
    }

    public endGroup(groupItem: ExpressionGroupItem) {
        this.currentGroup = groupItem.parent;
    }

    public commitOperandEdit(item: ExpressionOperandItem) {
        item.expression.fieldName = this.selectedColumn.field;
        item.expression.condition = this.selectedColumn.filters.condition(this.selectedCondition);
        item.expression.searchVal = this.searchValue;

        item.inEditMode = false;
        this.editedExpression = null;
    }

    public cancelOperandAdd() {
        if (this.addModeExpression) {
            this.addModeExpression.inAddMode = false;
            this.addModeExpression = null;
        }
    }

    public cancelOperandEdit() {
        if (this.editedExpression) {
            this.editedExpression.inEditMode = false;
            this.editedExpression = null;
        }
    }

    public isExpressionGroup(expression: ExpressionItem): boolean {
        return expression instanceof ExpressionGroupItem;
    }

    private addGroup(operator: FilteringLogic, parent?: ExpressionGroupItem, afterExpression?: ExpressionItem) {
        this.cancelOperandAdd();

        const groupItem = new ExpressionGroupItem(operator, parent);

        if (parent) {
            if (afterExpression) {
                const index = parent.children.indexOf(afterExpression);
                parent.children.splice(index + 1, 0, groupItem);
            } else {
                parent.children.push(groupItem);
            }
        } else {
            this.rootGroup = groupItem;
        }

        this.addCondition(groupItem);
        this.currentGroup = groupItem;
    }

    private createExpressionGroupItem(expressionTree: IFilteringExpressionsTree, parent?: ExpressionGroupItem): ExpressionGroupItem {
        let groupItem: ExpressionGroupItem;
        if (expressionTree) {
            groupItem = new ExpressionGroupItem(expressionTree.operator, parent);

            for (const expr of expressionTree.filteringOperands) {
                if (expr instanceof FilteringExpressionsTree) {
                    groupItem.children.push(this.createExpressionGroupItem(expr, groupItem));
                } else {
                    const operandItem = new ExpressionOperandItem(expr as IFilteringExpression, groupItem);
                    groupItem.children.push(operandItem);
                }
            }
        }

        return groupItem;
    }

    private createExpressionsTreeFromGroupItem(groupItem: ExpressionGroupItem): FilteringExpressionsTree {
        const expressionsTree = new FilteringExpressionsTree(groupItem.operator);

        for (const item of groupItem.children) {
            if (item instanceof ExpressionGroupItem) {
                const subTree = this.createExpressionsTreeFromGroupItem((item as ExpressionGroupItem));
                expressionsTree.filteringOperands.push(subTree);
            } else {
                expressionsTree.filteringOperands.push((item as ExpressionOperandItem).expression);
            }
        }

        return expressionsTree;
    }

    public onChipRemove(expressionItem: ExpressionItem) {
       this.deleteItem(expressionItem);
    }

    public onChipClick(expressionItem: ExpressionItem) {
        this._clickTimer = setTimeout(() => {
            if (!this._preventChipClick) {
                this.toggleExpression(expressionItem);
            }
            this._preventChipClick = false;
        }, this._dblClickDelay);
    }

    public onChipDblClick(expressionItem: ExpressionOperandItem) {
        clearTimeout(this._clickTimer);
        this._preventChipClick = true;
        this.enterExpressionEdit(expressionItem);
    }

    public enterExpressionEdit(expressionItem: ExpressionOperandItem) {
        for (const expr of this.selectedExpressions) {
            expr.selected = false;
        }
        this.selectedExpressions = [];

        if (this.editedExpression) {
            this.editedExpression.inEditMode = false;
        }

        this.selectedColumn = expressionItem.expression.fieldName ?
            this.grid.getColumnByName(expressionItem.expression.fieldName) : null;
        this.selectedCondition = expressionItem.expression.condition ?
            expressionItem.expression.condition.name : null;
        this.searchValue = expressionItem.expression.searchVal;

        expressionItem.inEditMode = true;
        this.editedExpression = expressionItem;
    }

    public enterExpressionAdd(expressionItem: ExpressionOperandItem) {
        expressionItem.inAddMode = true;
        this.addModeExpression = expressionItem;
        this.toggleExpression(expressionItem);
    }

    private toggleExpression(expressionItem: ExpressionItem) {
        expressionItem.selected = !expressionItem.selected;

        if (expressionItem.selected) {
            this.selectedExpressions.push(expressionItem);
        } else {
            const index = this.selectedExpressions.indexOf(expressionItem);
            this.selectedExpressions.splice(index, 1);
        }
    }

    private deleteItem(expressionItem: ExpressionItem) {
        if (!expressionItem.parent) {
            this.rootGroup = null;
            return;
        }
        const children = expressionItem.parent.children;
        const index = children.indexOf(expressionItem);
        children.splice(index, 1);

        if (!children.length) {
            this.deleteItem(expressionItem.parent);
        }
    }

    public onKeyDown(eventArgs) {
        eventArgs.stopPropagation();
    }

    public initialize(filteringService: IgxFilteringService, overlayService: IgxOverlayService,
        overlayComponentId: string) {
        this.filteringService = filteringService;
        this.overlayService = overlayService;
        this.overlayComponentId = overlayComponentId;

        if (!this.grid.crossFieldFilteringExpressionsTree) {
            const tree = new FilteringExpressionsTree(FilteringLogic.And);
            tree.filteringOperands.push({
                fieldName: 'ID',
                condition: IgxStringFilteringOperand.instance().condition('contains'),
                searchVal: 'a',
                ignoreCase: true
            });
            const orTree = new FilteringExpressionsTree(FilteringLogic.Or);
            orTree.filteringOperands.push({
                fieldName: 'ID',
                condition: IgxStringFilteringOperand.instance().condition('contains'),
                searchVal: 'b',
                ignoreCase: true
            });
            orTree.filteringOperands.push({
                fieldName: 'CompanyName',
                condition: IgxStringFilteringOperand.instance().condition('contains'),
                searchVal: 'c',
                ignoreCase: true
            });
            tree.filteringOperands.push(orTree);
            tree.filteringOperands.push({
                fieldName: 'CompanyName',
                condition: IgxStringFilteringOperand.instance().condition('contains'),
                searchVal: 'd',
                ignoreCase: true
            });
            this.grid.crossFieldFilteringExpressionsTree = tree;
        }

        if (this.grid.crossFieldFilteringExpressionsTree) {
            this.rootGroup = this.createExpressionGroupItem(this.grid.crossFieldFilteringExpressionsTree);
            this.currentGroup = this.rootGroup;
        }
    }

    public context(expression: ExpressionItem, afterExpression?: ExpressionItem) {
        return {
            $implicit: expression,
            afterExpression
        };
    }

    public onClearButtonClick() {
        this.rootGroup = null;
        this.grid.crossFieldFilteringExpressionsTree = null;
    }

    public closeDialog() {
        if (this.overlayComponentId) {
            this.overlayService.hide(this.overlayComponentId);
        }
    }

    public onApplyButtonClick() {
        this.grid.crossFieldFilteringExpressionsTree = this.createExpressionsTreeFromGroupItem(this.rootGroup);
        this.closeDialog();
    }
}
