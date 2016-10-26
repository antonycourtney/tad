/* @flow */
import test from 'tape'
import * as reltab from '../src/reltab' // eslint-disable-line

const {col, constVal} = reltab

test('trivial test', (t) => {
  t.plan(1)
  t.ok(true, 'trivial truth value')
  t.end()
})

test('reltab filter expressions', (t) => {
  t.plan(3)
  const e1 = reltab.and()

  const e1s = JSON.stringify(e1)
  t.ok(e1s === '{"expType":"FilterExp","op":"AND","opArgs":[]}', 'basic json encoding')

  const e2 = e1.eq(col('x'), constVal(30))
  const e2s = e2.toSqlWhere()
  t.ok(e2s === 'x=30', 'basic toSqlWhere')

  const e3 = e2.eq(col('y'), constVal('hello'))
  const e3s = e3.toSqlWhere()
  t.ok(e3s === "x=30 AND y='hello'", 'compound toSqlWhere')

  const e4 = e3.subExp(reltab.or().gt(col('z'), constVal(50)).gt(col('a'), col('b')))

  const e4s = e4.toSqlWhere()

  console.log('e4s.toSqlWhere: ', e4s)

  t.end()
})
