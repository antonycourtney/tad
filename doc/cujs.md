# Critical user journeys for the view controls

A fixed set of tasks for judging designs of Tad's view controls: the sidebar, the header menu, the filter bar, and the proposed new columns, column pivots and colours.

Each journey describes a finished view and the operations that build it, without assuming any particular UI. To judge a design, walk each journey through it and count the costs below. The journeys use public data, so anyone can repeat them. Journey 1 rebuilds a report that ships with Tad.

## Scoring

Walk the journey from its starting state by the most direct path that a user who knows the design would take. Count:

- **Actions:** clicks, drags and key presses.
  - Typing a search or a value counts as one.
  - Opening a menu and picking from it counts as two.
  - Scrolling isn't counted.
- **Moves:** each time attention has to go to a different area: the column list, the shelves, a settings panel, a popover, the grid, a header menu, the filter bar. Going back counts again.
- **Mode changes:** each time the user switches a control that changes what other controls mean (such as Layout / Aggregation / Format), and each time a panel's contents change under them.
- **Hidden steps:** steps that use something not visible until you know it's there: a key, a right-click, a hover-only button, a drag with no drop hint.

Also note:
- whether the grid shows the result after each step;
- the first step a newcomer would have to search for.

Lower is better on every count. The counts aren't added together, though: two extra clicks in one place cost less than one trip to a distant panel.

Unless a journey says otherwise, it starts like this:
- the file has just been opened;
- every column is shown, in the file's order;
- nothing is pivoted, sorted or filtered;
- the sidebar shows View settings.

## The journeys

### 1. Movies: the top-grossing directors in each country

Rebuilds `packages/tad-app/csv/movie-grossByCountryDirector.tad`.

- **Who:** an analyst showing a colleague which directors' films earn the most in each country, with a link to each film.
- **Data:** `packages/tad-app/csv/movie_metadata.csv` (5,043 films, 28 columns; the IMDB 5000 set from Kaggle).
- **Finished view:**
  - Rows: country › director_name, with each film's row labelled by its title.
  - Columns: gross and movie_imdb_link only; 26 of the 28 are hidden.
  - Sorted by gross, highest first, so the biggest countries and directors come first.
  - USA is open, and under it Steven Spielberg and Tim Burton.
  - Links show as links (the Text default).
- **Operations:**
  1. Hide all the columns except gross and movie_imdb_link.
  2. Pivot by country, then director_name.
  3. Label the leaf rows with movie_title.
  4. Sort by gross, descending.
  5. Open USA, Steven Spielberg and Tim Burton.
- **Variant 1b** (`movie-grossByDirectorWithFilter.tad`): also show budget, and keep only films that have a gross and a budget of at least $10M (three conditions).
- **Tests:**
  - the layout basics;
  - showing a few columns out of many;
  - the pivot's order;
  - a filter with several conditions.

### 2. Titanic: who survived

- **Who:** someone opening Tad for the first time, on a famous small dataset.
- **Data:** the Titanic passenger list, with copies on GitHub and Kaggle. It has 891 rows and 12 columns: PassengerId, Survived (0 or 1), Pclass, Name, Sex, Age, SibSp, Parch, Ticket, Fare, Cabin, Embarked.
- **Finished view:** a 3 × 2 table, with Pclass down the side and Sex across the top. Each cell holds the survival rate (the average of Survived, as a percentage) and the number of passengers.
- **Operations:**
  1. Pivot rows by Pclass.
  2. Pivot columns by Sex. *(Proposed: column pivots.)*
  3. Show Survived, aggregated by Avg, as a percentage, and hide everything else.
  4. Show the number of passengers. *(Today this comes from the pivot column's row counts, or from Count on PassengerId.)*
- **Tests:**
  - The first five minutes: can a newcomer find pivoting unaided?
  - Changing one column's aggregation.
  - A column pivot.
  - A percentage format, which Tad doesn't have today.

### 3. Penguins: compare species

- **Who:** a student comparing the measurements of three species of penguin.
- **Data:** Palmer Penguins, from the palmerpenguins project on GitHub. It has 344 rows and 8 columns: species, island, bill_length_mm, bill_depth_mm, flipper_length_mm, body_mass_g, sex, year.
- **Finished view:**
  - Rows: species › sex.
  - Columns: the four measurements, each the **average** rather than the sum.
  - The two bill measurements with 1 decimal place; flipper length and body mass with none.
  - Body mass coloured by value, heavier darker. *(Proposed: colours.)*
- **Operations:**
  1. Pivot by species, then sex.
  2. Hide species, island, sex and year. (Pivoting by a column doesn't hide it.)
  3. Change the aggregation of four columns to Avg.
  4. Format two columns with 1 decimal place.
  5. Colour body_mass_g.
- **Tests:**
  - the same change to several columns at once (aggregation and format);
  - type defaults versus a column's own setting.

### 4. Superstore: where the profit is

- **Who:** an analyst doing the classic BI exercise on Tableau's sample data.
- **Data:** Sample – Superstore, which ships with Tableau; copies are on Kaggle. It has about 10,000 order lines in 21 columns, including Order Date, Region, Category, Sub-Category, Sales, Quantity, Discount and Profit.
- **Finished view:**
  - Rows: Region › Category › Sub-Category.
  - Columns: each order year, and under each year Sales, Profit and Margin.
  - Margin is total profit ÷ total sales, as a percentage. It's a ratio of sums, not an average of each line's ratio.
  - Profit and Margin are coloured red for losses, blue for gains and grey at 0.
  - Sales and Profit show as whole dollars, with thousands separators.
- **Operations:**
  1. New column: the year of Order Date. *(Proposed.)*
  2. New column: Margin = Profit / Sales, aggregated as sum(Profit) / sum(Sales). *(Proposed. It needs a formula over aggregates; see Gaps.)*
  3. Pivot rows by Region › Category › Sub-Category, and columns by the year.
  4. Show only Sales, Profit and Margin.
  5. Format Sales and Profit with no decimals, and Margin as a percentage.
  6. Colour Profit and Margin with a diverging palette centred on 0.
- **Tests:**
  - new columns;
  - a column pivot with several values;
  - diverging colours;
  - formats on a few columns.

### 5. NYC taxis: when do people tip?

- **Who:** a data engineer exploring a month of trip records.
- **Data:** one month of NYC TLC yellow taxi trips as Parquet, from the NYC TLC trip record page. It has about 3 million rows and 19 columns, including the pickup and drop-off times, trip_distance, payment_type, fare_amount, tip_amount and total_amount.
- **Finished view:** a heatmap. The rows are the hour of pickup (0–23) and the columns are the day of the week (Mon … Sun). Each cell is the average tip as a percentage of the fare, coloured.
- **Operations:**
  1. Filter: payment_type = 1 (card) and fare_amount > 0. Cash tips aren't recorded.
  2. New columns: the hour of pickup, the day of the week of pickup, and tip_pct = tip_amount / fare_amount. *(Proposed.)*
  3. Pivot rows by hour and columns by day of the week, with the days in calendar order, not A–Z.
  4. Show only tip_pct, aggregated by Avg, as a percentage.
  5. Colour tip_pct.
- **Tests:**
  - filters and new columns on a large file;
  - date-part templates;
  - ordering a pivot by something other than its labels' text;
  - a heatmap.

### 6. CO₂: a wide table

- **Who:** a journalist working with Our World in Data's CO₂ dataset.
- **Data:** `owid-co2-data.csv` from the owid/co2-data repository on GitHub. It has about 50,000 rows and 80 columns, including country, year, iso_code, population, gdp, co2, co2_per_capita and share_global_co2.
- **Finished view:**
  - Countries only, without World, the continents or the income groups.
  - Rows: country. Columns: decade, from the 1950s to the 2020s. Each cell: the average CO₂ per person.
  - All 8 decade columns show 1 decimal place and are coloured on the same scale.
  - Sorted by the 2020s value, highest first.
- **Operations:**
  1. Filter: iso_code is not NULL.
  2. New column: decade, the year rounded down to a multiple of 10. *(Proposed.)*
  3. Pivot rows by country and columns by decade.
  4. Show only co2_per_capita, aggregated by Avg (79 of the 80 columns hidden).
  5. Format it with 1 decimal place and colour it; every pivoted column follows.
  6. Sort by the 2020s column.
- **Tests:**
  - finding a few columns among many, and showing only one;
  - many pivoted columns that should be formatted and coloured as one;
  - sorting by a pivoted column.

### 7. Read someone else's view

- **Who:** a colleague who has been sent `movie-grossByDirectorWithFilter.tad`.
- **Task:**
  - Without changing anything, say what the view shows: what it's pivoted and sorted by, what's filtered, what's hidden, and which columns have their own aggregation or format.
  - Then undo one thing: remove the budget filter.
- **Tests:**
  - how much of a view's state is visible without opening anything;
  - whether settings that differ from the defaults stand out.

## Walkthroughs

Three designs are walked here:
- **A**, today's release, with the Blueprint sidebar;
- **B**, the new UI as built (behind the switch);
- **C**, the mock-up's sidebar redesign ("select, then act": a settings panel under the column list that shows whatever is selected).

The many-columns study is B plus multi-select: any control on a selected row applies to every selected row.

### Journey 1

**A. Today's release**

| # | Step | Actions | Where |
|---|---|---|---|
| 1 | Untick Show on "All Columns" | 1 | Column list |
| 2 | Tick Show on gross and movie_imdb_link (the list is A–Z) | 2 | Column list |
| 3 | Tick Pivot on country, then director_name | 2 | Column list |
| 4 | Tick Sort on gross; open the Sort tab; pick desc | 4 | Column list, then the tabs |
| 5 | Pivot Tree Leaf Level: movie_title | 2 | Under the list |
| 6 | Open USA, Spielberg, Burton | 3 | Grid |
| | **Total** | **14** | **3 moves** |

**B. The new UI**

| # | Step | Actions | Where |
|---|---|---|---|
| 1 | Click the All row's Show box, which hides every column | 1 | Column list |
| 2 | Tick Show on gross and movie_imdb_link | 2 | Column list |
| 3 | Tick Pivot on country, then director_name | 2 | Column list |
| 4 | Click the Sort box on gross twice (ascending, then descending) | 2 | Column list |
| 5 | Label leaf rows with: movie_title | 2 | Under the Pivot shelf |
| 6 | Open USA, Spielberg, Burton | 3 | Grid |
| | **Total** | **12** | **2 moves** |

- Steps 1–4 happen in one place, a row at a time, and each shows in the grid at once.
- There are no mode changes and no hidden steps.
- Sorting from the grid (clicking gross's header twice) costs the same.

**C. The redesign**

| # | Step | Actions | Where |
|---|---|---|---|
| 1 | Click any row, ⌘A, then Show: Hidden | 3 | List, then panel |
| 2 | Click gross, ⌘-click movie_imdb_link, then Show: Shown | 3 | List, then panel |
| 3 | Click gross, then Sort: ↓ Desc | 2 | List, then panel |
| 4 | Drag country to Rows, then director_name | 2 | List to shelf, twice |
| 5 | Label leaf rows with: movie_title | 2 | Under the shelves |
| 6 | Open USA, Spielberg, Burton | 3 | Grid |
| | **Total** | **15** | **about 10 moves** |

- The panel's contents change 3 times: all columns, two columns, one column.
- Without dragging, step 4 becomes "click country, Pivot: Rows; click director_name, Pivot: Rows". That's 4 actions and 4 more moves.
- With the keys (⌘A H, click, ⌘-click, H, …) C is about as short as B, but every key is a hidden step.

### Journey 3

Colours aren't in B yet. Here B uses the proposal's header menu for them: ▾, then Colors, then a palette.

**B. The new UI**

| # | Step | Actions | Where |
|---|---|---|---|
| 1 | Tick Pivot on species, then sex | 2 | Column list |
| 2 | Untick Show on species, island, sex, year | 4 | Column list |
| 3 | Switch to Aggregation; pick Avg in four menus | 1 + 8 | Column list (a mode change) |
| 4 | Switch to Format; open the Real default; Custom; 1 decimal; close | 1 + 4 | Column list (a mode change), popover |
| 5 | Header menu on body_mass_g: Colors, Greens | 3 | Grid header |
| | **Total** | **23** | **3 moves, 2 mode changes** |

**The study (B with multi-select)**

| # | Step | Actions | Where |
|---|---|---|---|
| 1–2 | As B | 6 | Column list |
| 3 | Switch to Aggregation; click bill_length_mm, Shift-click body_mass_g; Avg in one menu | 1 + 4 | Column list (a mode change) |
| 4–5 | As B | 8 | Popover, grid header |
| | **Total** | **19** | **3 moves, 2 mode changes** |

**C. The redesign**

| # | Step | Actions | Where |
|---|---|---|---|
| 1 | Drag species, then sex, to Rows | 2 | List to shelf, twice |
| 2 | Click species, ⌘-click island, sex, year; Show: Hidden | 5 | List, then panel |
| 3 | Click bill_length_mm, Shift-click body_mass_g; Aggregate: Avg | 4 | List, then panel |
| 4 | Click the Real defaults chip; Format: Custom; 1 decimal | 3 | Defaults row, then panel |
| 5 | Click body_mass_g; Colors: On | 2 | List, then panel |
| | **Total** | **16** | **about 11 moves; the panel changes 4 times** |

### Journey 7

| | B | C |
|---|---|---|
| Pivot, sort, filter | Visible on the shelves and in the filter bar | The same |
| Hidden columns | Dimmed rows; scroll the list | The same, plus a "hidden" tag |
| Own aggregations | Switch to Aggregation and look for blue | A tag on the row |
| Own formats | Switch to Format and look for dots | A tag on the row |
| **Mode changes** | **2** | **0** |
| Remove the budget filter | × on its chip: 1 action | The same |

### The scores so far

| Journey | A | B | Study | C |
|---|---|---|---|---|
| 1: layout | 14 actions, 3 moves | **12, 2** | 12, 2 | 15, ~10 |
| 3: several columns at once | (not walked) | 23, 3 | 19, 3 | **16**, ~11 |
| 7: reading a view | (not walked) | 2 mode changes | 2 mode changes | **0** |

Journeys 2, 4, 5 and 6 need the proposed features. They'll be walked for the next round of designs.

## Review of the two sidebars

### The new UI (B)

What works:
- **Layout in one place.** Show, Pivot and Sort take one click each, on the column's own row, and every change shows in the grid at once. Journey 1 is the cheapest in B.
- **Showing only a few columns is cheap:** the All box, then the few.
- **Order is visible and direct:** the shelves show the pivot's and the sort's order, and chips are dragged to reorder.

What doesn't:
- **The Layout / Aggregation / Format switch is a mode.** The same rows mean three different things.
  - A column's aggregation and format are never visible at the same time as its layout.
  - Reading a view (journey 7) means visiting every mode.
- **Three idioms for three kinds of setting:** check boxes for layout, menus for aggregation and a popover for format. Colours would add a fourth.
- **One column at a time.** Setting four aggregations takes 8 actions (journey 3).
- **Pivot and Sort check boxes partly duplicate the shelves.** That's fine as a fast path, but the Pivot box can only add to Rows. With column pivots it would need a second box or a menu.
- **Showing a hidden column moves its row.** The list puts shown columns first. Ticking Show moves the row up to the end of the shown block, away from the pointer. (This comes from reading the code, not from watching it.)
- **A pivoted column stays shown as a column.** Journeys 1 and 3 both hide it by hand.

### The redesign (C)

What works:
- **One vocabulary for settings.** Every setting is a row with the same anatomy, and "mixed" and "own" look the same everywhere.
- **Bulk changes are cheap.** Journey 3 is the cheapest in C.
- **Tags make the state readable from the list.** Journey 7 needs no mode changes.
- **Type defaults are first-class.**

What doesn't:
- **For Show, selecting is the task.** "Which columns" is a choice *of* columns. Separating selection from action adds a step and a move exactly where the task is selection itself. (This is the review's point about jumping between the list and the panel.)
- **The panel is far from what it describes.** Journey 1 takes about 10 moves against B's 2.
- **The panel is implicit.**
  - Its contents depend on state you can't see, namely what's selected.
  - It switches between three kinds of content: the view, columns and a type default.
  - The Defaults chips look like columns but select something else.
- **Speed relies on hidden steps:** H, R, S and ⌘A.
- **The panel takes about a third of the sidebar,** all the time.

### Prior art

Excel's PivotTable field list, Tableau and Google Sheets' pivot editor all split things the same way:
- **Membership** is direct.
  - Excel: ticking a field puts it in the report, and it's dragged between the Rows, Columns and Values areas.
  - Tableau: fields are dragged onto the Rows, Columns, Filters and Marks shelves.
- **A field's own settings open from the field itself,** on its chip in an area:
  - Excel's Value Field Settings: summarize by, number format;
  - Tableau's pill menu: measure, format, sort;
  - Sheets' value card: summarize by, show as.

None of them uses a separate inspector for a field's settings.

## What the journeys suggest

Hypotheses for the next design, to be walked through every journey before anything is built:

1. **Membership stays direct.** Shown, pivoted and sorted are choices *of* columns. They belong on the list's rows and on the shelves, as check boxes, chips and drags.
   - Uniformity here means that the three behave alike: the same kind of mark on the row, and the same chip on a shelf.
2. **Settings open where the column is.**
   - A column's aggregation, format and colours appear in a popover attached to the row, chip or header that was clicked, using the redesign's uniform rows.
   - With several columns selected, the same popover sets them all, showing Mixed where they differ.
   - This is one move away, rather than a distant panel.
3. **No modes in the list.**
   - Each row shows its non-default settings as compact tags, as in the redesign, so no Layout / Aggregation / Format switch is needed to see them.
   - Clicking a tag opens that setting.
4. **Pivoting hides the column,** and un-pivoting shows it again. This removes a step that journeys 1 and 3 repeat for every pivot.
5. **Type defaults:** reached from a column's popover ("Use for all Real columns"), or kept as a short list of their own. This is an open question.

## Gaps the journeys expose

These are features the journeys need, whatever the design:
- **A percentage format** (journeys 2, 4 and 5).
- **Formulas over aggregates.** Margin = sum(Profit) / sum(Sales) differs from the average of each line's margin (journey 4). Tip percentage could reasonably be either (journey 5), so the user should be able to choose.
- **Ordering a pivot's values** other than A–Z: days of the week in calendar order, and hours as numbers (journey 5).
- **Sorting rows by a pivoted column,** for example countries by their 2020s value (journey 6).
- **A count per cell under a column pivot** (journey 2).
- **One colour scale across a column's pivoted copies,** so that the 8 decades are comparable (journey 6).
