import frappe, json

r = {}
r['shawarma'] = frappe.get_all('Item', fields=['name','item_name','item_group'], filters={'item_name': ['like', '%شاورما%']}, limit=20)
r['sauce'] = frappe.get_all('Item', fields=['name','item_name','item_group'], filters={'item_name': ['like', '%سس%']}, limit=20)
r['lavash'] = frappe.get_all('Item', fields=['name','item_name','item_group'], filters={'item_name': ['like', '%لواش%']}, limit=20)
r['paprika'] = frappe.get_all('Item', fields=['name','item_name'], filters={'item_name': ['like', '%پاپریکا%']}, limit=10)
r['turmeric'] = frappe.get_all('Item', fields=['name','item_name'], filters={'item_name': ['like', '%زردچوبه%']}, limit=10)
r['cumin'] = frappe.get_all('Item', fields=['name','item_name'], filters={'item_name': ['like', '%زیره%']}, limit=10)
r['yogurt'] = frappe.get_all('Item', fields=['name','item_name'], filters={'item_name': ['like', '%یونانی%']}, limit=10)
r['dijon'] = frappe.get_all('Item', fields=['name','item_name'], filters={'item_name': ['like', '%دیژون%']}, limit=10)
r['pickle'] = frappe.get_all('Item', fields=['name','item_name'], filters={'item_name': ['like', '%خیارشور%']}, limit=10)
r['chicken'] = frappe.get_all('Item', fields=['name','item_name'], filters={'item_name': ['like', '%مرغ%']}, limit=10)
r['bom'] = frappe.get_all('BOM', fields=['name','item','item_name'], filters={'item_name': ['like', '%شاورما%']}, limit=10)
r['bom_sauce'] = frappe.get_all('BOM', fields=['name','item','item_name'], filters={'item_name': ['like', '%سس%']}, limit=10)

print(json.dumps(r, ensure_ascii=False))
