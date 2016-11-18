const data = [];

for (let i = 0; i < 500; i++){
  const d = (data[i] = {});

  d.id = i;
  d['title'] = 'Task ' + i;
  d['description'] = 'This is a sample task description.\n  It can be multiline';
  d['duration'] = '5 days';
  d['percentComplete'] = Math.round(Math.random() * 100);
  d['start'] = '01/01/2009';
  d['finish'] = '01/05/2009';
  d['effortDriven'] = (i % 5 == 0);
}

export default data;
