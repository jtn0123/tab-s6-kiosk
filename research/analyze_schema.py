"""Analyze AOSP display-device-config.xsd:
   1. Does it load as a strict XSD at all? (AOSP uses xsdc codegen, may not be strict-valid)
   2. Which children of displayConfiguration are mandatory?
   3. What does hdrBrightnessConfig actually require?
"""
from lxml import etree

XSD = "display-device-config.xsd"
NS = {"xs": "http://www.w3.org/2001/XMLSchema"}

print("=" * 60)
print("1. Can lxml load this as a strict XSD schema?")
print("=" * 60)
try:
    doc = etree.parse(XSD)
    schema = etree.XMLSchema(doc)
    print("   YES - loads as a valid XSD. Strict validation is possible.")
    STRICT = True
except Exception as e:
    print("   NO - schema will not load strictly:")
    print(f"   {type(e).__name__}: {e}")
    STRICT = False

print()
print("=" * 60)
print("2. Mandatory children of <displayConfiguration>")
print("=" * 60)
tree = etree.parse(XSD)
root = tree.getroot()

dc = root.find('.//xs:element[@name="displayConfiguration"]', NS)
seq = dc.find('.//xs:sequence', NS)
required, optional = [], []
for el in seq.findall('xs:element', NS):
    nm = el.get("name")
    ty = el.get("type", "")
    mo = el.get("minOccurs")
    (optional if mo == "0" else required).append((nm, ty))

print(f"   REQUIRED ({len(required)}):")
for nm, ty in required:
    print(f"      <{nm}>   type={ty}")
print()
print(f"   OPTIONAL ({len(optional)}):")
for nm, ty in optional:
    print(f"      <{nm}>   type={ty}")

print()
print("=" * 60)
print("3. hdrBrightnessConfig children")
print("=" * 60)
hdr = root.find('.//xs:complexType[@name="hdrBrightnessConfig"]', NS)
if hdr is None:
    print("   not found")
else:
    # children may be direct xs:element (non-standard) or inside a compositor
    kids = hdr.findall('.//xs:element', NS)
    for el in kids:
        nm = el.get("name")
        ty = el.get("type", "")
        mo = el.get("minOccurs", "(default=1, required)")
        ann = [a.get("name") for a in el.findall("xs:annotation", NS)]
        print(f"      <{nm}>  type={ty}  minOccurs={mo}  ann={ann}")
    # is there a compositor?
    comp = [c.tag.split('}')[-1] for c in hdr if c.tag.split('}')[-1] in ("sequence", "all", "choice")]
    print(f"\n   compositor present: {comp if comp else 'NONE  <-- elements declared bare inside complexType'}")

print()
print("=" * 60)
print("4. nonNegativeFloatToFloatMap (used by brightnessMap / sdrHdrRatioMap)")
print("=" * 60)
m = root.find('.//xs:complexType[@name="nonNegativeFloatToFloatMap"]', NS)
if m is not None:
    print(etree.tostring(m, pretty_print=True).decode()[:1200])
