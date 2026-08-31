import {
	type ColumnVisibilityState,
	flexRender,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
	createListingColumns,
	listingsTableFeatures as features,
} from "#/components/listings-table-columns";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { ListingWithPlaces } from "#/server/db/types";

export function ListingsTable({
	listings,
	favoriteIds,
	onToggleFavorite,
	dismissedIds,
	onToggleDismiss,
}: {
	listings: ListingWithPlaces[];
	favoriteIds: Set<string>;
	onToggleFavorite: (id: string) => void;
	dismissedIds: Set<string>;
	onToggleDismiss: (id: string) => void;
}) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnVisibility, setColumnVisibility] =
		useState<ColumnVisibilityState>({});

	const columns = useMemo(
		() =>
			createListingColumns({
				favoriteIds,
				onToggleFavorite,
				dismissedIds,
				onToggleDismiss,
			}),
		[favoriteIds, onToggleFavorite, dismissedIds, onToggleDismiss],
	);

	const table = useTable({
		features,
		data: listings,
		columns,
		state: { sorting, columnVisibility },
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
		getRowId: (l) => l.id,
		initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
	});

	return (
		<div className="flex flex-col gap-3">
			<div className="flex justify-end">
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="gap-1.5"
							>
								<Columns3 className="size-4" />
								Colunas
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						{table.getAllLeafColumns().reduce<ReactNode[]>((items, column) => {
							if (!column.getCanHide()) return items;
							items.push(
								<DropdownMenuCheckboxItem
									key={column.id}
									checked={column.getIsVisible()}
									onCheckedChange={(checked) =>
										column.toggleVisibility(!!checked)
									}
								>
									{column.columnDef.meta?.label ?? column.id}
								</DropdownMenuCheckboxItem>,
							);
							return items;
						}, [])}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 whitespace-normal text-center text-sm text-muted-foreground"
								>
									Nenhum imóvel encontrado com esses filtros.
								</TableCell>
							</TableRow>
						) : (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className={cell.column.columnDef.meta?.cellClassName}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between">
				<span className="text-sm text-muted-foreground">
					{table.getRowModel().rows.length} de {listings.length} imóveis
				</span>
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">
						Página {table.state.pagination.pageIndex + 1} de{" "}
						{Math.max(1, table.getPageCount())}
					</span>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={!table.getCanPreviousPage()}
						onClick={() => table.previousPage()}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={!table.getCanNextPage()}
						onClick={() => table.nextPage()}
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
