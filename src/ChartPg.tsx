type TimeSeriesItem = {
  label: string;
  color: string;
  data: number[];
};

type Params = {
  title: string | null;
  timeSeries: TimeSeriesItem[];
  legendWidth: [120, 120]; // width for the columns
  showAxis: boolean; // true by default
};

/*

цель - удобная функция которая генерирует svg графики. Использует d3, будет использоваться в pdf отчетах
Будем постепенно добавлять больше функций, начинаем с простого.

  - финальный SVG должен быть такой что его финальные размеры высчитываются
    динамически на основе параметров: есть ли заголовок, оси, легенда и другие элементы
  - внутри должны быть отдельные функции которые генерируют отдельные части (legend, chart, axis, title)
      - важно! нельзя использовать <g> со сдвигом для позиционирования разных блоков, в финальной
        svg все элементы должны позиционироваться относительно общего начала координат
      - при этом отдельные части можно выключать и перемешивать между собой.
        Например: если нет заголовка, то зона графика должна быть максимально сверху,
        а если нет осей, то ещё и прибита слева. Так что нужен удобный механизм (отдельно от d3) который
        бы прокидывал отступы сверху и слева
  - всякие параметры размеров и прочего нужно выносить в константы для удобной конфигурации
  - для начала начнем с простой конфигурации сверху вниз: заголовок, график, легенда.
    Если есть оси, то все сдвинуто вправо чтоб поместилась ось y.

*/

const TITLE = {
  fontSize: 16,
  color: "",
};

const CHART = {
  width: 600,
  height: 200,
  lineColor: "",
  axisFontSize: 16,
};

const AXIS = {
  leftWidth: 80, // width for y-axis ticks and labels
};

function renderTimeSeriesChart(params: Params) {
  return "<svg>";
}

export function ChartPg() {
  return (
    <div>
      <h2>Charts will be here</h2>
      <div
        dangerouslySetInnerHTML={{
          __html: renderTimeSeriesChart({
            timeSeries: [],
            title: "step 1",
          }),
        }}
      ></div>
    </div>
  );
}
