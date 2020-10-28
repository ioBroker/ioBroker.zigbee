'use strict';

class debugIdentifier {
    ReportIdentifier() {
      return "Asgothian GitHub " + ReportVersion() + ' ...';
    }
    ReportVersion()
    {
      return "1.3.1.a";
    }
}

module.exports = debugIdentifier;
