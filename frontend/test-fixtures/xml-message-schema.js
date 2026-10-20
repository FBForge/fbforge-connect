// Small synthetic XSDs exercise message selection and the constructs used by XÖV messages.
export const namespace = 'urn:test:building';
const messages = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${namespace}" targetNamespace="${namespace}" elementFormDefault="qualified">
  <xs:element name="basis" abstract="true" type="xs:string"/>
  <xs:element name="vorgang.transportieren" type="xs:string"/>
  <xs:element name="genehmigungsfreistellung.anzeige.0600">
    <xs:annotation><xs:appinfo><title>Anzeige des Bauvorhabens</title></xs:appinfo></xs:annotation>
    <xs:complexType><xs:complexContent><xs:extension base="t:Nachricht">
      <xs:sequence><xs:element name="bauvorhaben" type="xs:string"/></xs:sequence>
    </xs:extension></xs:complexContent></xs:complexType>
  </xs:element>
  <xs:complexType name="Nachricht"><xs:complexContent><xs:restriction base="t:Basis">
    <xs:sequence><xs:group ref="t:Kopf"/><xs:choice><xs:sequence>
      <xs:element name="anzeigender" type="t:Code" minOccurs="2" maxOccurs="3"/>
    </xs:sequence><xs:element name="unbenutzt" type="xs:string"/></xs:choice></xs:sequence>
    <xs:attribute name="standard" fixed="Fiktiver Teststandard" use="required"/>
  </xs:restriction></xs:complexContent></xs:complexType>
  <xs:complexType name="Basis"><xs:attribute name="version" fixed="1.0" use="required"/></xs:complexType>
  <xs:group name="Kopf"><xs:sequence><xs:element name="nachrichtenkopf" form="unqualified"><xs:complexType><xs:sequence><xs:element name="nachrichtentyp" type="t:Nachrichtencode"/><xs:element name="telefon" type="t:Telefon"/></xs:sequence></xs:complexType></xs:element></xs:sequence></xs:group>
  <xs:simpleType name="Nachrichtencode"><xs:restriction base="xs:token">
    <xs:enumeration value="0100"><xs:annotation><xs:appinfo><beschreibung>vorgang.transportieren</beschreibung></xs:appinfo></xs:annotation></xs:enumeration>
    <xs:enumeration value="0600"><xs:annotation><xs:appinfo><beschreibung>genehmigungsfreistellung.anzeige.0600</beschreibung></xs:appinfo></xs:annotation></xs:enumeration>
  </xs:restriction></xs:simpleType>
  <xs:simpleType name="Telefon"><xs:restriction base="xs:string"><xs:pattern value="[0-9]{5}"/></xs:restriction></xs:simpleType>
  <xs:complexType name="Code"><xs:simpleContent><xs:extension base="t:Codewert"><xs:attributeGroup ref="t:Listenangabe"/></xs:extension></xs:simpleContent></xs:complexType>
  <xs:simpleType name="Codewert"><xs:restriction base="xs:token"><xs:enumeration value="TEST"/></xs:restriction></xs:simpleType>
  <xs:attributeGroup name="Listenangabe"><xs:attribute name="listURI" fixed="urn:test:codelist" use="required"/></xs:attributeGroup>
</xs:schema>`;
export const xmlPacket = {
  schemaPackage: 1,
  schemas: [
    { name: 'messages.xsd', text: messages, primary: true },
    {
      name: 'imports.xsd',
      text: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="hilfswert" type="xs:string"/></xs:schema>',
      primary: false,
    },
  ],
};
